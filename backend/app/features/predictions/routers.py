import asyncio
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Dict, Any
from app.db.mongodb import get_database
from app.features.auth.dependencies import get_current_user
from app.features.predictions.schemas import (
    HealthIntakePayload,
    PredictionResponse,
    PredictionRecord,
    WhatIfRequest,
    WhatIfResponse,
    WhatIfDiseaseComparison
)
from app.ml.service import process_prediction, compute_health_score

router = APIRouter(tags=["Predictions"])


@router.post("/predict", response_model=PredictionResponse)
async def predict_risk(
    payload: HealthIntakePayload,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Any = Depends(get_database)
):
    """
    Run independent risk prediction & SHAP explanations for Diabetes and Heart Disease models.
    Persists prediction record to MongoDB predictions collection and saves non-ML onboarding intake
    to medicalHistory, wellness, and healthScores collections.
    """
    raw_payload = payload.model_dump(exclude_none=True)
    # Include all original values sent in request
    full_dict = payload.model_dump()
    full_dict.update(raw_payload)

    # --- NON-ML HEALTH SCORE CALCULATOR ---
    # Computes transparent 0-100 score + sub-scores for user wellness reporting.
    # DOES NOT FEED INTO OR ALTER ML PREDICTION MODELS.
    health_score_dict = compute_health_score(full_dict)
    full_dict["health_score"] = health_score_dict

    # Run ML prediction & SHAP pipeline in worker thread to prevent event loop blocking
    results = await asyncio.to_thread(process_prediction, full_dict)


    # Persist main record in MongoDB predictions collection
    timestamp = datetime.now(timezone.utc).isoformat()
    doc = {
        "user_id": current_user["id"],
        "timestamp": timestamp,
        "input_payload": full_dict,
        "results": results
    }

    if db is not None:
        await db.predictions.insert_one(doc)

        # --- PERSIST TO SEPARATE MONGODB COLLECTIONS ---
        # 1. medicalHistory collection
        med_history = full_dict.get("medicalHistory") or full_dict.get("medical_history") or []
        if med_history:
            await db.medicalHistory.insert_one({
                "user_id": current_user["id"],
                "timestamp": timestamp,
                "medicalHistory": med_history
            })

        # 2. wellness collection (Mental Wellness - optional, non-diagnostic, separate from ML models)
        mental_wellness = full_dict.get("mentalWellness") or full_dict.get("mental_wellness")
        if mental_wellness:
            await db.wellness.insert_one({
                "user_id": current_user["id"],
                "timestamp": timestamp,
                "mentalWellness": mental_wellness,
                "is_optional": True,
                "note": "NON-DIAGNOSTIC mental wellness context. Feeds LLM context only, NEVER passed to ML models."
            })

        # 3. healthScores collection
        await db.healthScores.insert_one({
            "user_id": current_user["id"],
            "timestamp": timestamp,
            "healthScore": health_score_dict
        })

        # 4. vitals collection
        has_vitals = any(full_dict.get(k) is not None for k in ["bpSystolic", "trestbps", "totalCholesterol", "chol", "glucose", "fastingGlucose", "hba1c"])
        if has_vitals:
            await db.vitals.insert_one({
                "user_id": current_user["id"],
                "timestamp": timestamp,
                "source": "assessment",
                "bp_systolic": full_dict.get("bpSystolic") or full_dict.get("trestbps"),
                "bp_diastolic": full_dict.get("bpDiastolic"),
                "total_cholesterol": full_dict.get("totalCholesterol") or full_dict.get("chol"),
                "fasting_glucose": full_dict.get("fastingGlucose") or full_dict.get("glucose"),
                "hba1c": full_dict.get("hba1c"),
                "confidence_tier": results.get("heartDisease", {}).get("confidenceTier")
            })

    return results


@router.get("/health-score")
async def get_health_score(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Retrieves the latest transparent non-ML Health Score for the authenticated user,
    including detailed sub-scores (Lifestyle, Fitness, Nutrition, Sleep, Stress) and breakdown documentation.
    """
    db = get_database()
    latest_score_doc = await db.healthScores.find_one({"user_id": current_user["id"]}, sort=[("timestamp", -1)])
    if latest_score_doc and "healthScore" in latest_score_doc:
        return latest_score_doc["healthScore"]

    latest_pred = await db.predictions.find_one({"user_id": current_user["id"]}, sort=[("timestamp", -1)])
    if latest_pred and "input_payload" in latest_pred:
        payload = latest_pred["input_payload"]
        if "health_score" in payload:
            return payload["health_score"]
        return compute_health_score(payload)

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="No health assessment records found. Please complete an assessment first."
    )


@router.get("/history", response_model=List[PredictionRecord])
async def get_prediction_history(
    limit: int = Query(50, ge=1, le=100, description="Maximum number of historical records to return"),
    skip: int = Query(0, ge=0, description="Number of historical records to skip"),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Retrieves historical predictions for the authenticated user, sorted by timestamp descending, with pagination.
    """
    db = get_database()
    cursor = db.predictions.find({"user_id": current_user["id"]}).sort("timestamp", -1).skip(skip).limit(limit)

    records = []
    async for doc in cursor:
        records.append(
            PredictionRecord(
                id=str(doc["_id"]),
                user_id=doc["user_id"],
                timestamp=doc["timestamp"],
                input_payload=doc.get("input_payload", {}),
                results=doc.get("results", {})
            )
        )

    return records


@router.post("/what-if", response_model=WhatIfResponse)
@router.post("/predictions/what-if", response_model=WhatIfResponse)
async def simulate_what_if_scenario(
    payload: WhatIfRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Any = Depends(get_database)
):
    """
    POST /what-if:
    Accepts only modifiable lifestyle/biometric inputs (BMI, physical activity, smoking, fruit/veg intake),
    clamps them to valid clinical ranges, re-runs the trained ML models against the user's latest baseline,
    and returns before/after risk estimates with user-facing SHAP factors.
    Strictly labelled: "an estimate, not a promise".
    """
    # 1. Fetch latest baseline prediction for current user
    latest_record = None
    if db is not None:
        try:
            latest_record = await db.predictions.find_one(
                {"user_id": current_user["id"]},
                sort=[("timestamp", -1)]
            )
        except Exception:
            pass

    if latest_record and latest_record.get("input_payload"):
        base_payload = dict(latest_record["input_payload"])
        orig_results = latest_record.get("results") or process_prediction(base_payload)
    else:
        # Standard default baseline if user hasn't completed an assessment yet
        base_payload = {
            "Age": 50, "age": 50, "Sex": 1, "sex": 1, "BMI": 27.5,
            "HighBP": 0, "HighChol": 0, "Smoker": 0, "PhysActivity": 1,
            "Fruits": 1, "Veggies": 1, "HvyAlcoholConsump": 0,
            "Stroke": 0, "HeartDiseaseorAttack": 0, "DiffWalk": 0,
            "GenHlth": 3, "MentHlth": 0, "PhysHlth": 0,
            "cp": 0, "trestbps": 128, "chol": 210, "fbs": 0, "exang": 0
        }
        orig_results = process_prediction(base_payload)

    # 2. Extract requested changes and clamp values
    changes_applied = {}
    simulated_payload = dict(base_payload)

    provided_changes = payload.model_dump(exclude_none=True)
    if not provided_changes:
        # Default scenario: keep current values
        provided_changes = {}

    for k, v in provided_changes.items():
        if k == "BMI":
            clamped_val = max(10.0, min(70.0, float(v)))
        else:
            clamped_val = 1.0 if float(v) >= 0.5 else 0.0

        orig_v = base_payload.get(k)
        changes_applied[k] = {
            "before": orig_v,
            "after": clamped_val
        }
        simulated_payload[k] = clamped_val

    # 3. Re-run models in worker thread
    simulated_results = await asyncio.to_thread(process_prediction, simulated_payload)

    # 4. Extract comparison statistics
    # Diabetes
    orig_d = orig_results.get("diabetes", {}).get("risk", {}) or {}
    new_d = simulated_results.get("diabetes", {}).get("risk", {}) or {}
    d_prob_orig = float(orig_d.get("probability", 0.0))
    d_prob_new = float(new_d.get("probability", 0.0))
    d_orig_level = str(orig_d.get("riskLevel", "Low Risk"))
    d_new_level = str(new_d.get("riskLevel", "Low Risk"))

    diabetes_comp = WhatIfDiseaseComparison(
        originalRiskLevel=d_orig_level,
        originalProbability=round(d_prob_orig, 4),
        newRiskLevel=d_new_level,
        newProbability=round(d_prob_new, 4),
        probabilityDelta=round(d_prob_new - d_prob_orig, 4),
        riskCategoryChanged=(d_orig_level != d_new_level)
    )

    # Heart Disease
    orig_h = orig_results.get("heartDisease", {}).get("risk", {}) or {}
    new_h = simulated_results.get("heartDisease", {}).get("risk", {}) or {}
    h_prob_orig = float(orig_h.get("probability", 0.0))
    h_prob_new = float(new_h.get("probability", 0.0))
    h_orig_level = str(orig_h.get("riskLevel", "Low Risk"))
    h_new_level = str(new_h.get("riskLevel", "Low Risk"))

    heart_comp = WhatIfDiseaseComparison(
        originalRiskLevel=h_orig_level,
        originalProbability=round(h_prob_orig, 4),
        newRiskLevel=h_new_level,
        newProbability=round(h_prob_new, 4),
        probabilityDelta=round(h_prob_new - h_prob_orig, 4),
        riskCategoryChanged=(h_orig_level != h_new_level)
    )

    # Factors for simulation
    d_factors = simulated_results.get("diabetes", {}).get("userFacingFactors", [])
    h_factors = simulated_results.get("heartDisease", {}).get("userFacingFactors", [])

    return WhatIfResponse(
        diabetes=diabetes_comp,
        heartDisease=heart_comp,
        changesApplied=changes_applied,
        userFacingFactors={
            "diabetes": d_factors,
            "heartDisease": h_factors
        },
        disclaimer="an estimate, not a promise"
    )


