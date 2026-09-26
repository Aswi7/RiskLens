import os
import json
import logging
from typing import Dict, Any, List, Tuple
from app.core.config import settings
from app.features.llm.schemas import (
    RecommendationResponse,
    RiskDriverItem,
    LifestyleRecommendationItem,
    ChatResponse,
    ChatMessage
)

logger = logging.getLogger("risklens.llm")

# Try importing OpenAI client
try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

RECOMMENDATIONS_SYSTEM_PROMPT = """You are RiskLens AI, an expert preventive health risk communicator and AI medical assistant.
Your job is to analyze a user's disease risk predictions (Diabetes & Heart Disease), their SHAP feature impact values, and their intake data to generate personalized, non-diagnostic health recommendations.

STRICT SAFETY CONSTRAINTS:
1. NON-DIAGNOSTIC: Never issue a formal clinical diagnosis, prognosis, or prescription. Use advisory language ("suggests elevated risk signal", "indicates potential focus area").
2. SHAP-GROUNDED: Focus specifically on the user's top positive SHAP risk drivers (features increasing their risk score). Do not invent unprovided clinical test values (like HbA1c or troponin).
3. ACTIONABLE & NON-PRESCRIPTIVE: Provide actionable lifestyle, dietary, physical activity, and monitoring suggestions. Recommend topics to discuss with their physician.
4. MUST OUTPUT VALID JSON matching this exact structure:
{
  "executiveSummary": "High-level summary of risks and overall health profile",
  "riskDriversBreakdown": [
    {"feature": "FeatureName", "impact": 0.25, "description": "User-friendly explanation of feature impact"}
  ],
  "lifestyleRecommendations": [
    {"category": "Diet|Exercise|Weight Management|Monitoring|Medical Consultation", "title": "Title", "action": "Specific action", "rationale": "Why it helps mitigate this SHAP risk"}
  ],
  "doctorQuestions": [
    "Question to ask primary care physician or specialist"
  ],
  "disclaimer": "Standard non-diagnostic medical safety disclaimer"
}
"""

CHAT_SYSTEM_PROMPT = """You are RiskLens AI Health Assistant, a helpful, safe, and empathetic AI assistant specialized in preventive health education.
You are answering follow-up questions from a user regarding their RiskLens assessment.

STRICT SAFETY CONSTRAINTS:
1. RED-FLAG EMERGENCY SAFETY: If the user describes acute emergency symptoms (severe chest pain, crushing chest pressure, left arm/jaw pain, acute difficulty breathing, sudden face drooping or limb numbness, fainting/loss of consciousness), IMMEDIATELY warn them to contact local emergency services (e.g. 911) or visit an Emergency Department right away.
2. GROUNDED IN CONTEXT: Ground your answers in the user's RiskLens assessment results and SHAP feature drivers provided in context.
3. NON-DIAGNOSTIC: Do not issue diagnoses or prescribe medication dosages.
4. CONCISE & EMPATHETIC: Keep answers supportive, clear, and easy to understand (2-4 paragraphs max).
"""

EMERGENCY_KEYWORDS = [
    "chest pain", "chest pressure", "crushing pain", "pain in arm", "left arm pain",
    "shortness of breath", "can't breathe", "difficulty breathing", "numbness",
    "face drooping", "slurred speech", "passed out", "fainted", "loss of consciousness",
    "coughing blood", "severe dizziness", "heart attack", "stroke symptoms"
]


def detect_emergency_red_flags(user_message: str) -> bool:
    """Scans user message for acute emergency red flags."""
    msg_lower = user_message.lower()
    for kw in EMERGENCY_KEYWORDS:
        if kw in msg_lower:
            return True
    return False


def extract_top_shap_features(shap_dict: Dict[str, float], top_n: int = 4) -> List[Tuple[str, float]]:
    """Extracts top positive SHAP features sorted descending by risk impact."""
    if not shap_dict:
        return []
    positive_features = [(k, v) for k, v in shap_dict.items() if v > 0]
    positive_features.sort(key=lambda x: x[1], reverse=True)
    return positive_features[:top_n]


def fallback_recommendations_generator(prediction_results: Dict[str, Any], input_payload: Dict[str, Any]) -> RecommendationResponse:
    """Clinical-grade fallback recommendation generator when no external LLM API key is configured."""
    diabetes = prediction_results.get("diabetes", {}) or {}
    heart = prediction_results.get("heartDisease", {}) or {}

    d_risk = diabetes.get("risk") or {}
    h_risk = heart.get("risk") or {}

    d_prob = d_risk.get("probability", 0.0) if d_risk else 0.0
    h_prob = h_risk.get("probability", 0.0) if h_risk else 0.0
    d_high = d_risk.get("isHighRisk", False) if d_risk else False
    h_high = h_risk.get("isHighRisk", False) if h_risk else False

    # Risk summary
    summary_parts = []
    if d_risk:
        if d_high:
            summary_parts.append(f"Elevated Diabetes Risk Signal ({d_prob*100:.1f}%)")
        else:
            summary_parts.append(f"Low Diabetes Risk Signal ({d_prob*100:.1f}%)")
    else:
        summary_parts.append("Diabetes Risk: Insufficient Intake Data")

    if h_risk:
        if h_high:
            summary_parts.append(f"Elevated Heart Disease Risk Signal ({h_prob*100:.1f}%)")
        else:
            summary_parts.append(f"Low Heart Disease Risk Signal ({h_prob*100:.1f}%)")
    else:
        summary_parts.append("Heart Disease Risk: Insufficient Intake Data")

    exec_summary = "RiskLens Multi-Disease Summary: " + " | ".join(summary_parts) + ". Your personalized breakdown highlights key lifestyle parameters that can be optimized to support cardiovascular and metabolic wellness."

    # Top SHAP drivers
    d_shap = diabetes.get("shapValues") or {}
    h_shap = heart.get("shapValues") or {}

    top_d_shap = extract_top_shap_features(d_shap, top_n=3)
    top_h_shap = extract_top_shap_features(h_shap, top_n=3)

    drivers_breakdown = []
    recommendations = []

    # Map SHAP drivers to user friendly descriptions and actions
    for feat, impact in top_d_shap:
        if feat == "HighBP":
            drivers_breakdown.append(RiskDriverItem(
                feature="High Blood Pressure",
                impact=impact,
                description="Elevated blood pressure places additional workload on pancreatic blood vessels and metabolic pathways."
            ))
            recommendations.append(LifestyleRecommendationItem(
                category="Monitoring & Diet",
                title="DASH Dietary Pattern & BP Tracking",
                action="Reduce sodium intake to under 2,000 mg/day and monitor home blood pressure weekly.",
                rationale="Lowering systemic blood pressure directly mitigates microvascular risk factors associated with diabetes."
            ))
        elif feat == "BMI":
            drivers_breakdown.append(RiskDriverItem(
                feature="Body Mass Index (BMI)",
                impact=impact,
                description="Higher body mass index increases systemic insulin resistance."
            ))
            recommendations.append(LifestyleRecommendationItem(
                category="Weight Management",
                title="Targeted Weight Reduction & Glycemic Management",
                action="Aim for a gradual 5-7% weight reduction through fiber-rich meals and moderate daily physical activity.",
                rationale="Modest weight loss significantly improves insulin sensitivity and glucose clearance."
            ))
        elif feat == "Age":
            drivers_breakdown.append(RiskDriverItem(
                feature="Age Bracket",
                impact=impact,
                description="Natural age progression shifts physiological metabolic baseline and glucose clearance rates."
            ))
        else:
            drivers_breakdown.append(RiskDriverItem(
                feature=feat,
                impact=impact,
                description=f"Feature {feat} contributed positively (+{impact:.2f}) to your statistical diabetes risk calculation."
            ))

    for feat, impact in top_h_shap:
        if feat == "chol":
            drivers_breakdown.append(RiskDriverItem(
                feature="Serum Cholesterol",
                impact=impact,
                description="Elevated serum cholesterol correlates with vascular plaque formation."
            ))
            recommendations.append(LifestyleRecommendationItem(
                category="Dietary Intervention",
                title="Saturated Fat Reduction & Soluble Fiber Boost",
                action="Replace saturated fats with mono-unsaturated fats (olive oil, nuts) and increase daily soluble fiber.",
                rationale="Soluble fiber binds cholesterol in the digestive tract, aiding hepatic LDL clearance."
            ))
        elif feat in ["cp_0", "cp_1", "cp_2", "cp_3"]:
            drivers_breakdown.append(RiskDriverItem(
                feature="Chest Discomfort Indicator",
                impact=impact,
                description="Reported chest discomfort patterns are significant indicators in cardiovascular risk evaluation."
            ))
            recommendations.append(LifestyleRecommendationItem(
                category="Medical Consultation",
                title="Cardiology Consultation for Chest Symptoms",
                action="Discuss any chest discomfort or exertion-related angina with a healthcare professional.",
                rationale="Clinical evaluation ensures appropriate diagnostic workup (e.g. ECG or stress testing)."
            ))
        elif feat == "trestbps":
            drivers_breakdown.append(RiskDriverItem(
                feature="Resting Blood Pressure",
                impact=impact,
                description="Higher resting blood pressure elevates arterial wall tension."
            ))
        else:
            drivers_breakdown.append(RiskDriverItem(
                feature=feat,
                impact=impact,
                description=f"Feature {feat} contributed positively (+{impact:.2f}) to your heart disease risk calculation."
            ))

    # Add default general recommendation if none were triggered
    if not recommendations:
        recommendations.append(LifestyleRecommendationItem(
            category="General Wellness",
            title="Regular Physical Activity & Balanced Nutrition",
            action="Engage in 150 minutes of moderate aerobic exercise per week and prioritize whole grains, vegetables, and lean proteins.",
            rationale="Sustained physical activity supports both metabolic glucose regulation and cardiac output."
        ))

    doctor_questions = [
        "What specific target blood pressure and fasting glucose goals should I aim for based on my profile?",
        "Would you recommend comprehensive lab screening (e.g. Lipid panel, HbA1c) during my next checkup?",
        "Are there specific exercise intensity thresholds or dietary modifications recommended for my health history?"
    ]

    return RecommendationResponse(
        executiveSummary=exec_summary,
        riskDriversBreakdown=drivers_breakdown,
        lifestyleRecommendations=recommendations,
        doctorQuestions=doctor_questions
    )


def generate_recommendations(prediction_results: Dict[str, Any], input_payload: Dict[str, Any]) -> RecommendationResponse:
    """Generates structured personalized health recommendations via OpenAI or fallback engine."""
    api_key = settings.OPENAI_API_KEY or os.environ.get("OPENAI_API_KEY")

    if not api_key or not OpenAI:
        logger.info("Using fallback recommendation generator (No OpenAI API key found).")
        return fallback_recommendations_generator(prediction_results, input_payload)

    try:
        client = OpenAI(api_key=api_key)
        user_prompt = f"""Generate personalized health recommendations based on this RiskLens Assessment Data:
PREDICTION RESULTS:
{json.dumps(prediction_results, indent=2)}

INPUT INTAKE PAYLOAD:
{json.dumps(input_payload, indent=2)}
"""
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": RECOMMENDATIONS_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.3
        )
        content = response.choices[0].message.content
        data = json.loads(content)
        return RecommendationResponse(**data)
    except Exception as e:
        logger.warning(f"OpenAI API call failed ({e}). Falling back to internal clinical recommendation engine.")
        return fallback_recommendations_generator(prediction_results, input_payload)


def generate_chat_reply(user_message: str, history: List[ChatMessage], context: Dict[str, Any]) -> ChatResponse:
    """Generates conversational response grounded in user's assessment context, with Red Flag Emergency Detection."""
    
    # 1. Emergency Red Flag Detection Check
    if detect_emergency_red_flags(user_message):
        emergency_warning = (
            "EMERGENCY ALERT: The symptoms you described (e.g., chest pain, severe shortness of breath, numbness, or fainting) "
            "may indicate an acute medical emergency. Please call emergency services (911 or your local emergency number) "
            "or go to the nearest emergency department immediately. Do not wait for online medical advice."
        )
        return ChatResponse(
            reply=emergency_warning,
            isEmergency=True
        )

    api_key = settings.OPENAI_API_KEY or os.environ.get("OPENAI_API_KEY")

    if not api_key or not OpenAI:
        # Safely extract risk dictionaries
        diabetes_res = context.get("diabetes", {}) or {} if context else {}
        heart_res = context.get("heartDisease", {}) or {} if context else {}

        d_risk = diabetes_res.get("risk") or {}
        h_risk = heart_res.get("risk") or {}

        d_str = f"{d_risk.get('probability', 0)*100:.1f}%" if d_risk else "Insufficient Data"
        h_str = f"{h_risk.get('probability', 0)*100:.1f}%" if h_risk else "Insufficient Data"

        reply = (
            f"Based on your RiskLens assessment context, your Diabetes Risk probability is {d_str} "
            f"and Heart Disease Risk probability is {h_str}.\n\n"
            f"To address your question ('{user_message}'): Key health management steps include maintaining consistent daily movement, "
            f"monitoring sodium and saturated fat intake, and discussing targeted biomarker testing (such as HbA1c and lipid profiles) "
            f"with your healthcare provider at your next visit."
        )
        return ChatResponse(
            reply=reply,
            isEmergency=False
        )

    try:
        client = OpenAI(api_key=api_key)
        messages = [{"role": "system", "content": CHAT_SYSTEM_PROMPT}]

        # Inject context summary into prompt
        if context:
            context_summary = f"USER RISKLENS CONTEXT:\n{json.dumps(context, indent=2)}"
            messages.append({"role": "system", "content": context_summary})

        # Add conversation history
        for msg in history[-6:]:  # Keep last 6 turns
            messages.append({"role": msg.role, "content": msg.content})

        messages.append({"role": "user", "content": user_message})

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.5
        )
        reply_content = response.choices[0].message.content
        return ChatResponse(
            reply=reply_content,
            isEmergency=False
        )
    except Exception as e:
        logger.warning(f"OpenAI Chat API call failed ({e}). Returning fallback response.")
        reply = f"Thank you for your question regarding '{user_message}'. Based on your profile assessment, we recommend focusing on your primary SHAP risk factors and consulting your physician for personalized medical advice."
        return ChatResponse(
            reply=reply,
            isEmergency=False
        )
