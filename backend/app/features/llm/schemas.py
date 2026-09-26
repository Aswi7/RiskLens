from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any


class RiskDriverItem(BaseModel):
    feature: str = Field(..., description="Feature name, e.g., HighBP, BMI, Age, chol")
    impact: float = Field(..., description="SHAP feature importance value")
    description: str = Field(..., description="User-friendly explanation of how this factor influences disease risk")


class LifestyleRecommendationItem(BaseModel):
    category: str = Field(..., description="Category: Diet, Exercise, Weight Management, Monitoring, Medical Consultation")
    title: str = Field(..., description="Clear title of the recommendation")
    action: str = Field(..., description="Specific, actionable lifestyle guidance")
    rationale: str = Field(..., description="Why this action helps mitigate the identified SHAP risk driver")


class RecommendationRequest(BaseModel):
    prediction_id: Optional[str] = Field(None, description="Optional ID of a saved prediction record in MongoDB")
    input_payload: Optional[Dict[str, Any]] = Field(None, description="Direct input payload if prediction_id is not provided")
    results: Optional[Dict[str, Any]] = Field(None, description="Direct prediction results if prediction_id is not provided")


class RecommendationResponse(BaseModel):
    executiveSummary: str = Field(..., description="High-level risk summary and key takeaways")
    riskDriversBreakdown: List[RiskDriverItem] = Field(..., description="SHAP-grounded risk drivers breakdown")
    lifestyleRecommendations: List[LifestyleRecommendationItem] = Field(..., description="Targeted actionable lifestyle interventions")
    doctorQuestions: List[str] = Field(..., description="Key questions to discuss with a physician")
    disclaimer: str = Field(
        default="RiskLens provides statistical risk estimates and educational guidance for informational purposes only. It is not a clinical diagnosis or medical prescription. Always consult a qualified healthcare provider for personal medical decisions.",
        description="Standard medical safety disclaimer"
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
    disclaimer: str = Field(
        default="RiskLens health assistant provides general information only. Seek immediate emergency medical care for acute symptoms.",
        description="Medical safety disclaimer"
    )
