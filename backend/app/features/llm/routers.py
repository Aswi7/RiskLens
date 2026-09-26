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
    Generates structured personalized lifestyle recommendations & doctor discussion points
    grounded in the user's prediction results and top SHAP risk drivers.
    Persists recommendation record in MongoDB.
    """
    db = get_database()
    input_payload = req.input_payload
    prediction_results = req.results

    # If prediction_id is passed, fetch from MongoDB predictions collection
    if req.prediction_id:
        query = {"user_id": current_user["id"]}
        if ObjectId.is_valid(req.prediction_id):
            query["_id"] = ObjectId(req.prediction_id)
        else:
            query["_id"] = req.prediction_id
            
        record = await db.predictions.find_one(query)
        if not record:
            # Fallback: get latest prediction for this user
            record = await db.predictions.find_one({"user_id": current_user["id"]}, sort=[("timestamp", -1)])
            
        if record:
            input_payload = record.get("input_payload", {})
            prediction_results = record.get("results", {})

    # If still no prediction data, fetch latest prediction for user
    if not prediction_results:
        latest_record = await db.predictions.find_one({"user_id": current_user["id"]}, sort=[("timestamp", -1)])
        if latest_record:
            input_payload = latest_record.get("input_payload", {})
            prediction_results = latest_record.get("results", {})
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No prediction results found. Please submit a /predict request first."
            )

    # Generate personalized recommendations via LLM / Fallback engine
    rec_response = generate_recommendations(prediction_results, input_payload)

    # Persist in MongoDB recommendations collection
    doc = {
        "user_id": current_user["id"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "prediction_id": req.prediction_id,
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
    Grounded in user risk profile + SHAP data.
    Enforces Acute Emergency Red-Flag Detection.
    Persists chat exchange to MongoDB chat_history collection.
    """
    context = req.context

    # If no context provided in request, attempt loading latest prediction
    if not context:
        db = get_database()
        latest = await db.predictions.find_one({"user_id": current_user["id"]}, sort=[("timestamp", -1)])
        if latest:
            context = latest.get("results", {})

    # Generate response
    chat_response = generate_chat_reply(req.message, req.history or [], context or {})

    # Persist exchange to MongoDB chat_history collection
    db = get_database()
    chat_doc = {
        "user_id": current_user["id"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "user_message": req.message,
        "assistant_reply": chat_response.reply,
        "is_emergency": chat_response.isEmergency
    }
    await db.chat_history.insert_one(chat_doc)

    return chat_response
