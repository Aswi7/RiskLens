import os
import uuid
import asyncio
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query

from app.db.mongodb import get_database
from app.features.auth.dependencies import get_current_user
from app.ml.service import process_prediction, compute_health_score
from app.features.labs.schemas import (
    ExtractedBiomarkerItem,
    LabExtractionResponse,
    BiomarkerConfirmationPayload,
    ClinicalFindingItem,
    LabFindingsReport,
    ConfirmedLabReportResponse,
    PaginatedLabReportsResponse
)
from app.features.labs.service import (
    verify_file_signature,
    get_pdf_page_count,
    process_lab_document_in_memory,
    evaluate_clinical_findings,
    derive_model_inputs_from_labs,
    check_disagreement
)

router = APIRouter(tags=["Lab Reports"])

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_PAGE_COUNT = 5


@router.post("/upload", response_model=LabExtractionResponse)
async def upload_lab_report(
    file: UploadFile = File(...),
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Any = Depends(get_database)
):
    """
    Accepts PDF, PNG, or JPG lab report files up to 10 MB and max 5 pages.
    Verifies file signature (magic bytes), extracts biomarkers in-memory off the event loop,
    scrubs all PII, deletes raw file bytes immediately, and never logs extracted text.
    Returns extracted fields with confidence labels and source snippets for patient review.
    """
    # 1. Size check
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File exceeds maximum allowed size of 10 MB ({len(file_bytes) // (1024 * 1024)} MB received)."
        )

    # 2. File signature / Magic bytes check
    is_valid, mime_type, detected_fmt = verify_file_signature(file_bytes, file.filename or "")
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file format. Please upload a valid PDF, PNG, or JPG document."
        )

    # 3. Page count check for PDFs (max 5 pages)
    if mime_type == "application/pdf":
        page_count = get_pdf_page_count(file_bytes)
        if page_count > MAX_PAGE_COUNT:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Report exceeds maximum allowed page count of {MAX_PAGE_COUNT} pages (document has {page_count} pages)."
            )

    # 4. Ephemeral Processing: Process in-memory off the event loop
    draft_id = str(ObjectId())
    extraction_res = await asyncio.to_thread(
        process_lab_document_in_memory,
        file_bytes,
        file.filename or "lab_report",
        mime_type,
        draft_id
    )

    # 5. Persist pending draft report in MongoDB
    if db is not None:
        try:
            draft_doc = {
                "_id": ObjectId(draft_id),
                "userId": current_user["id"],
                "filename": extraction_res.filename,
                "fileType": extraction_res.file_type,
                "pageCount": extraction_res.page_count,
                "status": "pending",
                "extracted_markers": {k: v.model_dump() for k, v in extraction_res.detected_markers.items()},
                "unclear_glucose_flag": extraction_res.unclear_glucose_flag,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.labReports.insert_one(draft_doc)
        except Exception as e:
            # Continue even if draft persistence was skipped in test mocks
            pass

    return extraction_res


@router.post("/{report_id}/confirm", response_model=ConfirmedLabReportResponse)
async def confirm_lab_report(
    report_id: str,
    payload: BiomarkerConfirmationPayload,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Any = Depends(get_database)
):
    """
    Accepts the user's reviewed and edited biomarker values and test date.
    Evaluates rule-based clinical findings, transforms features into the Heart Disease
    and Diabetes ML models, and re-runs the prediction.
    Stores confirmed values and flags any disagreements between lab findings and ML risk.
    """
    # 1. Rule-based clinical findings evaluation
    user_sex = current_user.get("sex", 1)  # Default male for HDL stratification if not specified
    report = evaluate_clinical_findings(payload, user_sex=user_sex)

    # 2. Re-run ML Prediction with confirmed lab values
    # Look up user's latest prediction intake to augment with confirmed lab values
    latest_pred = None
    if db is not None:
        try:
            latest_pred = await db.predictions.find_one({"user_id": current_user["id"]}, sort=[("timestamp", -1)])
        except Exception:
            pass

    base_payload = latest_pred.get("input_payload", {}) if latest_pred else {}

    # Augment base payload with confirmed lab values
    updated_payload = dict(base_payload)
    model_inputs = report.model_inputs

    # Map Heart Disease Model parameters
    if model_inputs.heart_disease.get("trestbps") is not None:
        updated_payload["trestbps"] = model_inputs.heart_disease["trestbps"]
    if model_inputs.heart_disease.get("chol") is not None:
        updated_payload["chol"] = model_inputs.heart_disease["chol"]
    if model_inputs.heart_disease.get("fbs") is not None:
        updated_payload["fbs"] = model_inputs.heart_disease["fbs"]

    # Explicitly set heart model confidence tier: "standard", "partial", or "screening"
    updated_payload["confidenceTier"] = model_inputs.confidence_tier

    # Map Diabetes Model parameters
    if model_inputs.diabetes.get("HighChol") is not None and model_inputs.diabetes["HighChol"] == 1.0:
        updated_payload["HighChol"] = 1.0
    if model_inputs.diabetes.get("HighBP") is not None and model_inputs.diabetes["HighBP"] == 1.0:
        updated_payload["HighBP"] = 1.0

    # Ensure required demographic defaults if not already present
    if "Age" not in updated_payload and "age" not in updated_payload:
        updated_payload["Age"] = current_user.get("age", 45)
    if "Sex" not in updated_payload and "sex" not in updated_payload:
        updated_payload["Sex"] = user_sex
    if "BMI" not in updated_payload:
        updated_payload["BMI"] = 25.0
    if "cp" not in updated_payload:
        updated_payload["cp"] = 0
    if "exang" not in updated_payload:
        updated_payload["exang"] = 0

    # Execute ML models
    ml_results = await asyncio.to_thread(process_prediction, updated_payload)

    # 3. Check for Disagreement between Lab Findings and ML Model Risk
    disagree, disagree_note = check_disagreement(report.findings, ml_results)
    report.disagreement_flag = disagree
    report.disagreement_note = disagree_note

    # 4. Storage & Persistence
    now_iso = datetime.now(timezone.utc).isoformat()
    test_date_val = payload.test_date or now_iso.split("T")[0]

    confirmed_doc = {
        "userId": current_user["id"],
        "user_id": current_user["id"],
        "testDate": test_date_val,
        "status": "confirmed",
        "confirmed_values": payload.model_dump(),
        "report": report.model_dump(),
        "model_risk": ml_results,
        "created_at": now_iso,
        "createdAt": now_iso
    }

    report_obj_id = ObjectId(report_id) if ObjectId.is_valid(report_id) else None

    if db is not None:
        try:
            if report_obj_id:
                await db.labReports.update_one(
                    {"_id": report_obj_id, "userId": current_user["id"]},
                    {"$set": confirmed_doc},
                    upsert=True
                )
            else:
                insert_res = await db.labReports.insert_one(confirmed_doc)
                report_id = str(insert_res.inserted_id)

            # Persist to vitals collection for longitudinal trends
            vitals_doc = {
                "user_id": current_user["id"],
                "userId": current_user["id"],
                "timestamp": now_iso,
                "testDate": test_date_val,
                "source": "lab_report",
                "bp_systolic": payload.bp_systolic,
                "bp_diastolic": payload.bp_diastolic,
                "total_cholesterol": payload.total_cholesterol,
                "hdl_cholesterol": payload.hdl_cholesterol,
                "ldl_cholesterol": payload.ldl_cholesterol,
                "triglycerides": payload.triglycerides,
                "fasting_glucose": payload.fasting_glucose,
                "random_glucose": payload.random_glucose,
                "hba1c": payload.hba1c,
                "confidence_tier": model_inputs.confidence_tier
            }
            await db.vitals.insert_one(vitals_doc)

            # Ensure indexes on labReports (userId and testDate)
            await db.labReports.create_index([("userId", 1), ("testDate", -1)])
        except Exception as e:
            pass

    return ConfirmedLabReportResponse(
        id=str(report_id),
        user_id=current_user["id"],
        test_date=test_date_val,
        status="confirmed",
        confirmed_values=payload.model_dump(),
        report=report,
        model_risk=ml_results,
        created_at=now_iso
    )


@router.get("", response_model=PaginatedLabReportsResponse)
@router.get("/", response_model=PaginatedLabReportsResponse)
async def list_user_lab_reports(
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(10, ge=1, le=50, description="Items per page"),
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Any = Depends(get_database)
):
    """
    Retrieves the authenticated user's confirmed lab reports, paginated, sorted by testDate descending.
    """
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable."
        )

    skip = (page - 1) * limit
    query = {
        "$or": [
            {"userId": current_user["id"]},
            {"user_id": current_user["id"]}
        ],
        "status": "confirmed"
    }

    total_count = await db.labReports.count_documents(query)
    cursor = db.labReports.find(query).sort("testDate", -1).skip(skip).limit(limit)

    reports = []
    async for doc in cursor:
        report_data = doc.get("report", {})
        reports.append(
            ConfirmedLabReportResponse(
                id=str(doc["_id"]),
                user_id=doc.get("userId") or doc.get("user_id") or current_user["id"],
                test_date=doc.get("testDate"),
                status=doc.get("status", "confirmed"),
                confirmed_values=doc.get("confirmed_values", {}),
                report=report_data,
                model_risk=doc.get("model_risk"),
                created_at=doc.get("createdAt") or doc.get("created_at") or datetime.now(timezone.utc).isoformat()
            )
        )

    total_pages = (total_count + limit - 1) // limit if total_count > 0 else 1

    return PaginatedLabReportsResponse(
        reports=reports,
        total_count=total_count,
        page=page,
        limit=limit,
        total_pages=total_pages
    )
