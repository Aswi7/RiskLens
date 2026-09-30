from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Dict, Any
from app.db.mongodb import get_database
from app.features.auth.dependencies import get_current_user
from app.features.predictions.schemas import (
    HealthIntakePayload,
    PredictionResponse,
    PredictionRecord
)
from app.ml.service import process_prediction, compute_health_score

router = APIRouter(tags=["Predictions"])


@router.post("/predict", response_model=PredictionResponse)
async def predict_risk(
    payload: HealthIntakePayload,
    current_user: Dict[str, Any] = Depends(get_current_user)
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

    # Run ML prediction pipeline (passing full_dict, ML models use their specific features)
    results = process_prediction(full_dict)

    # Persist main record in MongoDB predictions collection
    timestamp = datetime.now(timezone.utc).isoformat()
    doc = {
        "user_id": current_user["id"],
        "timestamp": timestamp,
        "input_payload": full_dict,
        "results": results
    }

    db = get_database()
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
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Retrieves all historical predictions for the authenticated user, sorted by timestamp descending.
    """
    db = get_database()
    cursor = db.predictions.find({"user_id": current_user["id"]}).sort("timestamp", -1)

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

