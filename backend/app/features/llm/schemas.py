from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any


class RecommendationRequest(BaseModel):
    prediction_id: Optional[str] = Field(None, description="Optional ID of a saved prediction record in MongoDB")
    input_payload: Optional[Dict[str, Any]] = Field(None, description="Direct input payload if prediction_id is omitted")
    results: Optional[Dict[str, Any]] = Field(None, description="Direct prediction results if prediction_id is omitted")


class RecommendationResponse(BaseModel):
    diet: List[str] = Field(..., description="Targeted dietary interventions grounded in SHAP drivers")
    exercise: List[str] = Field(..., description="Targeted physical activity guidance")
    sleep: str = Field(..., description="Sleep and lifestyle recovery guidance")
    urgency: str = Field(..., description="'low' | 'moderate' | 'high'")
    sharedRiskFactors: Optional[List[str]] = Field(None, description="Shared risk factors if both disease risks are elevated")
    disclaimer: str = Field(
        default="RiskLens provides statistical risk estimates and educational guidance for informational purposes only. It is not a clinical diagnosis or medical prescription. Always consult a qualified physician for personalized medical decisions.",
        description="Medical safety disclaimer"
    )


class ChatMessage(BaseModel):
    role: str = Field(..., description="'user' or 'assistant'")
    content: str = Field(..., description="Message text content")


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, description="User follow-up question")
    history: Optional[List[ChatMessage]] = Field(default=[], description="Past conversation history")
    context: Optional[Dict[str, Any]] = Field(None, description="Risk prediction & SHAP context")


class ChatResponse(BaseModel):
    reply: str = Field(..., description="Assistant response content")
    isEmergency: bool = Field(False, description="True if acute emergency red flags were detected")
    skippedLLM: bool = Field(False, description="True if LLM call was skipped due to pre-safety filter match")
    disclaimer: str = Field(
        default="RiskLens health assistant provides general educational information only. Seek immediate medical care for emergency symptoms or consult your doctor for prescription guidance.",
        description="Medical safety disclaimer"
    )
