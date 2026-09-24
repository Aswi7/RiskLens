from datetime import datetime, timezone
from fastapi import APIRouter, Depends, status
from typing import List, Dict, Any
from app.db.mongodb import get_database
from app.features.auth.dependencies import get_current_user
from app.features.predictions.schemas import (
    HealthIntakePayload,
    PredictionResponse,
    PredictionRecord
)
from app.ml.service import process_prediction

router = APIRouter(tags=["Predictions"])


@router.post("/predict", response_model=PredictionResponse)
async def predict_risk(
    payload: HealthIntakePayload,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Run independent risk prediction & SHAP explanations for Diabetes and Heart Disease models.
    Persists prediction record to MongoDB predictions collection.
    """
    raw_payload = payload.model_dump(exclude_none=True)
    # Include all original values sent in request
    full_dict = payload.model_dump()
    full_dict.update(raw_payload)

    # Run ML prediction pipeline
    results = process_prediction(full_dict)

    # Persist record in MongoDB
    timestamp = datetime.now(timezone.utc).isoformat()
    doc = {
        "user_id": current_user["id"],
        "timestamp": timestamp,
        "input_payload": full_dict,
        "results": results
    }

    db = get_database()
    await db.predictions.insert_one(doc)

    return results


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
