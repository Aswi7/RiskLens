from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any
from bson import ObjectId
from app.db.mongodb import get_database
from app.features.auth.dependencies import get_current_user
from app.features.llm.schemas import (
    RecommendationRequest,
    RecommendationResponse,
    ChatRequest,
    ChatResponse
)
from app.features.llm.service import generate_recommendations, generate_chat_reply

router = APIRouter(tags=["AI Advice & Chat"])


@router.post("/recommendations", response_model=RecommendationResponse)
async def get_personalized_recommendations(
    req: RecommendationRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Generates structured personalized health recommendations JSON.
    Caches recommendations per prediction ID in MongoDB recommendations collection
    to avoid regenerating on every dashboard reload.
    """
    db = get_database()
    input_payload = req.input_payload
    prediction_results = req.results
    prediction_id_str = req.prediction_id

    # Find target prediction record
    if prediction_id_str:
        query = {"user_id": current_user["id"]}
        if ObjectId.is_valid(prediction_id_str):
            query["_id"] = ObjectId(prediction_id_str)
        else:
            query["_id"] = prediction_id_str

        record = await db.predictions.find_one(query)
        if record:
            input_payload = record.get("input_payload", {})
            prediction_results = record.get("results", {})
            prediction_id_str = str(record["_id"])

    # If prediction_id not provided or not found, use latest user prediction
    if not prediction_results:
        latest_record = await db.predictions.find_one({"user_id": current_user["id"]}, sort=[("timestamp", -1)])
        if latest_record:
            input_payload = latest_record.get("input_payload", {})
            prediction_results = latest_record.get("results", {})
            prediction_id_str = str(latest_record["_id"])
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No prediction results found. Please submit a /predict request first."
            )

    # CHECK CACHE: Check if recommendation already exists for this prediction_id
    if prediction_id_str:
        cached = await db.recommendations.find_one({
            "user_id": current_user["id"],
            "prediction_id": prediction_id_str
        })
        if cached and "recommendations" in cached:
            return RecommendationResponse(**cached["recommendations"])

    # Generate new recommendation
    rec_response = generate_recommendations(prediction_results, input_payload)

    # Save to MongoDB recommendations collection for caching
    doc = {
        "user_id": current_user["id"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "prediction_id": prediction_id_str,
        "recommendations": rec_response.model_dump()
    }
    await db.recommendations.insert_one(doc)

    return rec_response


@router.post("/chat", response_model=ChatResponse)
async def chat_health_assistant(
    req: ChatRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Conversational AI assistant for follow-up health questions.
    Pre-LLM safety filter checks for medication/dosage requests and emergency red flags BEFORE every LLM call.
    Persists all chat exchanges to MongoDB chatMessages collection.
    """
    context = req.context

    # Load latest prediction context if not provided
    if not context:
        db = get_database()
        latest = await db.predictions.find_one({"user_id": current_user["id"]}, sort=[("timestamp", -1)])
        if latest:
            context = latest.get("results", {})

    # Generate reply (with Pre-LLM safety checks)
    chat_response = generate_chat_reply(req.message, req.history or [], context or {})

    # Persist exchange to MongoDB chatMessages collection (as required by prompt)
    db = get_database()
    chat_doc = {
        "user_id": current_user["id"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "user_message": req.message,
        "assistant_reply": chat_response.reply,
        "is_emergency": chat_response.isEmergency,
        "skipped_llm": chat_response.skippedLLM
    }
    await db.chatMessages.insert_one(chat_doc)

    return chat_response
