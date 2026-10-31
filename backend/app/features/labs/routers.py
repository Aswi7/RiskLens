from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from app.db.mongodb import get_database
from app.features.auth.dependencies import get_current_user
from app.features.labs.schemas import (
    LabExtractionResponse,
    BiomarkerConfirmationPayload,
    LabFindingsReport,
    LabReportRecord
)
from app.features.labs.service import (
    parse_lab_file,
    evaluate_clinical_findings
)

router = APIRouter(tags=["Lab Analysis"])

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp"
}


@router.post("/extract", response_model=LabExtractionResponse)
async def extract_lab_report(
    file: UploadFile = File(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Extracts clinical biomarkers in-memory from an uploaded lab report (PDF or image).
    Zero-disk persistence: file is read in RAM, scrubbed of PII, and discarded.
    Returns detected biomarkers and confidence for patient confirmation.
    """
    if file.content_type and file.content_type.lower() not in ALLOWED_CONTENT_TYPES and not file.filename.lower().endswith((".pdf", ".png", ".jpg", ".jpeg", ".webp")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file format. Please upload a PDF or image file (PNG, JPG, WEBP)."
        )

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum allowed size of {MAX_FILE_SIZE // (1024 * 1024)} MB."
        )

    extraction_res = await parse_lab_file(file_bytes, file.filename or "lab_report", file.content_type or "")
    return extraction_res


@router.post("/interpret", response_model=LabFindingsReport)
async def interpret_biomarkers(
    payload: BiomarkerConfirmationPayload,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Evaluates confirmed biomarker values against AHA / ACC / ADA / NCEP clinical thresholds.
    Returns structured rule-based lab findings, reference intervals, severity flags,
    and transformed parameters for the Heart Disease & Diabetes ML models.
    """
    report = evaluate_clinical_findings(payload)
    return report


@router.post("/confirm", response_model=LabFindingsReport)
async def confirm_and_save_lab_report(
    payload: BiomarkerConfirmationPayload,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Any = Depends(get_database)
):
    """
    Persists confirmed lab values and clinical findings to the user's health profile in MongoDB.
    Saves to both `labReports` and `vitals` collections.
    """
    report = evaluate_clinical_findings(payload)
    timestamp = datetime.now(timezone.utc).isoformat()

    doc = {
        "user_id": current_user["id"],
        "timestamp": timestamp,
        "confirmed_values": payload.model_dump(),
        "report": report.model_dump()
    }

    if db is not None:
        await db.labReports.insert_one(doc)

        # Also persist to dedicated vitals collection
        vitals_doc = {
            "user_id": current_user["id"],
            "timestamp": timestamp,
            "source": "lab_report",
            "bp_systolic": payload.bp_systolic,
            "bp_diastolic": payload.bp_diastolic,
            "total_cholesterol": payload.total_cholesterol,
            "hdl_cholesterol": payload.hdl_cholesterol,
            "ldl_cholesterol": payload.ldl_cholesterol,
            "triglycerides": payload.triglycerides,
            "fasting_glucose": payload.fasting_glucose,
            "hba1c": payload.hba1c
        }
        await db.vitals.insert_one(vitals_doc)

    return report


@router.get("/latest", response_model=LabFindingsReport)
async def get_latest_lab_report(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Any = Depends(get_database)
):
    """Retrieves the most recent confirmed lab report and findings for the user."""
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable."
        )
    record = await db.labReports.find_one({"user_id": current_user["id"]}, sort=[("timestamp", -1)])
    if not record or "report" not in record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No confirmed lab reports found for this user."
        )
    return record["report"]


@router.get("/history", response_model=List[LabReportRecord])
async def get_lab_reports_history(
    limit: int = 20,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Any = Depends(get_database)
):
    """Retrieves historical lab report records for the authenticated user."""
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection unavailable."
        )
    cursor = db.labReports.find({"user_id": current_user["id"]}).sort("timestamp", -1).limit(limit)

    results = []
    async for doc in cursor:
        results.append(
            LabReportRecord(
                id=str(doc["_id"]),
                user_id=doc["user_id"],
                timestamp=doc["timestamp"],
                confirmed_values=doc.get("confirmed_values", {}),
                report=doc.get("report", {})
            )
        )
    return results
