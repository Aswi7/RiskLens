import os
import re
import json
import logging
import httpx
from typing import Dict, Any, List, Tuple, Optional
from app.core.config import settings
from app.features.llm.schemas import (
    RecommendationResponse,
    ChatResponse,
    ChatMessage
)

logger = logging.getLogger("risklens.llm")

# Try importing SDKs if available
try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

RECOMMENDATIONS_SYSTEM_PROMPT = """You are RiskLens AI, an expert preventive health risk communicator and AI medical assistant.
Your job is to analyze a user's disease risk predictions (Diabetes & Heart Disease), their SHAP feature impact values, and their intake data to generate structured, personalized, non-diagnostic health recommendations.

STRICT SAFETY CONSTRAINTS:
1. NON-DIAGNOSTIC: Never issue a formal clinical diagnosis, prognosis, or prescription.
2. NO MEDICATION ADVICE: Never recommend specific medications, dosages, or drug treatments.
3. PHYSICIAN CONSULTATION: Explicitly advise consulting a physician when risk is moderate or high.
4. SHAP-GROUNDED: Focus specifically on the user's top positive SHAP risk drivers. Do not invent unprovided lab values.
5. MUST OUTPUT VALID JSON ONLY matching this exact structure:
{
  "diet": ["Dietary recommendation 1", "Dietary recommendation 2"],
  "exercise": ["Exercise recommendation 1", "Exercise recommendation 2"],
  "sleep": "Sleep and lifestyle recovery guidance",
  "urgency": "low|moderate|high",
  "sharedRiskFactors": ["Shared risk factor 1"] (include only if both disease risks are elevated/moderate),
  "disclaimer": "Standard non-diagnostic medical safety disclaimer recommending physician consultation"
}
"""

CHAT_SYSTEM_PROMPT = """You are RiskLens AI Health Assistant, a helpful, safe, and empathetic AI assistant specialized in preventive health education.
You are answering follow-up questions from a user regarding their RiskLens assessment.

STRICT SAFETY CONSTRAINTS:
1. NO DIAGNOSIS OR MEDICATION: Do not issue diagnoses or prescribe medication dosages.
2. GROUNDED IN CONTEXT: Ground your answers in the user's RiskLens assessment results, SHAP drivers, and lifestyle recommendations provided in context.
3. CONCISE & EMPATHETIC: Keep answers supportive, clear, and easy to understand.
"""

MEDICATION_PATTERNS = [
    r"\b(dose|dosage|mg|milligram|pill|pills|tablets|prescription)\b",
    r"\b(metformin|statin|atorvastatin|lisinopril|amlodipine|insulin|ozempic|wegovy|glyburide|aspirin|ibuprofen)\b",
    r"\b(should i take|how much to take|prescribe|what dosage|how many pills)\b",
    r"\btake \d+\s*(mg|milligram|g)\b"
]

EMERGENCY_PATTERNS = [
    r"\b(chest pain|chest pressure|crushing pain|pain in left arm|arm pain|jaw pain)\b",
    r"\b(shortness of breath|can't breathe|difficulty breathing|gasping)\b",
    r"\b(numbness|face drooping|slurred speech|stroke)\b",
    r"\b(passed out|fainted|loss of consciousness|fainting)\b",
    r"\b(coughing blood|suicide|kill myself|want to die|self harm)\b"
]


def check_pre_llm_safety_filters(user_message: str) -> Tuple[bool, Optional[str], bool]:
    """
    Pre-LLM Safety Pattern & Keyword Filter.
    Returns: (is_matched, safe_reply_text, is_emergency)
    """
    msg_lower = user_message.lower()

    # 1. Emergency / Crisis check
    for pattern in EMERGENCY_PATTERNS:
        if re.search(pattern, msg_lower):
            safe_reply = (
                "EMERGENCY ALERT: The symptoms or crisis language you described require immediate emergency evaluation. "
                "Please call emergency services (911 or your local emergency number) or go to the nearest emergency department immediately. "
                "Do not rely on an online application for acute medical emergencies."
            )
            return True, safe_reply, True

    # 2. Medication / Dosage Request check
    for pattern in MEDICATION_PATTERNS:
        if re.search(pattern, msg_lower):
            safe_reply = (
                "RiskLens is an educational risk assessment tool and cannot recommend, prescribe, or provide advice on specific medications, "
                "drug dosages, or medical treatments. Please consult a qualified doctor or licensed pharmacist regarding any medication questions."
            )
            return True, safe_reply, False

    return False, None, False


def extract_top_shap_features(shap_dict: Dict[str, float], top_n: int = 4) -> List[Tuple[str, float]]:
    """Extracts top positive SHAP features sorted descending by risk impact."""
    if not shap_dict:
        return []
    positive_features = [(k, v) for k, v in shap_dict.items() if v > 0]
    positive_features.sort(key=lambda x: x[1], reverse=True)
    return positive_features[:top_n]


def fallback_recommendations_generator(prediction_results: Dict[str, Any], input_payload: Dict[str, Any]) -> RecommendationResponse:
    """Clinical fallback recommendation generator returning strict structured JSON schema."""
    diabetes = prediction_results.get("diabetes", {}) or {}
    heart = prediction_results.get("heartDisease", {}) or {}

    d_risk = diabetes.get("risk") or {}
    h_risk = heart.get("risk") or {}

    d_prob = d_risk.get("probability", 0.0) if d_risk else 0.0
    h_prob = h_risk.get("probability", 0.0) if h_risk else 0.0
    d_high = d_risk.get("isHighRisk", False) if d_risk else False
    h_high = h_risk.get("isHighRisk", False) if h_risk else False

    # Determine Urgency
    if d_prob >= 0.6 or h_prob >= 0.6 or (d_high and h_high):
        urgency = "high"
    elif d_high or h_high or d_prob >= 0.4 or h_prob >= 0.4:
        urgency = "moderate"
    else:
        urgency = "low"

    # Extract SHAP drivers
    d_shap = diabetes.get("shapValues") or {}
    h_shap = heart.get("shapValues") or {}

    top_d_shap = extract_top_shap_features(d_shap, top_n=3)
    top_h_shap = extract_top_shap_features(h_shap, top_n=3)

    diet_recs = []
    exercise_recs = []

    # Map SHAP drivers to actionable diet & exercise
    d_feats = [f[0] for f in top_d_shap]
    h_feats = [f[0] for f in top_h_shap]

    if "HighBP" in d_feats or "trestbps" in h_feats:
        diet_recs.append("Adopt a DASH-style dietary pattern, limiting daily sodium intake to under 2,000 mg and increasing potassium-rich foods.")
        exercise_recs.append("Engage in 30 minutes of moderate aerobic exercise (brisk walking, cycling) 5 days per week to support healthy vascular tone.")

    if "BMI" in d_feats or "chol" in h_feats:
        diet_recs.append("Replace refined carbohydrates and saturated fats with whole grains, legumes, and omega-3 fatty acids to support lipid clearance.")
        exercise_recs.append("Incorporate resistance training twice weekly to improve body composition and peripheral glucose clearance.")

    if not diet_recs:
        diet_recs.append("Focus on a nutrient-dense Mediterranean diet high in vegetables, lean proteins, and unsaturated fats.")
    if not exercise_recs:
        exercise_recs.append("Aim for at least 150 minutes of moderate physical activity per week spread consistently across 4-5 days.")

    sleep_guidance = "Prioritize 7-8 hours of uninterrupted sleep per night. Consistent sleep schedules optimize circadian metabolic recovery and cortisol regulation."

    shared_factors = []
    if (d_high or d_prob >= 0.4) and (h_high or h_prob >= 0.4):
        if "HighBP" in d_feats or "trestbps" in h_feats:
            shared_factors.append("Elevated Blood Pressure: Impacts both cardiovascular vascular resistance and pancreatic microvascular circulation.")
        if "BMI" in d_feats or "chol" in h_feats:
            shared_factors.append("Metabolic & Lipid Disruption: Weight management and lipid balance simultaneously influence both cardiometabolic risk scores.")

    disclaimer = "RiskLens provides statistical risk estimates for educational guidance only. It is not a clinical diagnosis or medical prescription. Always consult a qualified physician for personalized medical evaluation."
    if urgency in ["moderate", "high"]:
        disclaimer += " Because your risk indicators are moderate/elevated, a physician consultation is strongly recommended."

    return RecommendationResponse(
        diet=diet_recs,
        exercise=exercise_recs,
        sleep=sleep_guidance,
        urgency=urgency,
        sharedRiskFactors=shared_factors if shared_factors else None,
        disclaimer=disclaimer
    )


def call_llm_json(prompt: str, system_prompt: str) -> Optional[Dict[str, Any]]:
    """Calls Gemini, OpenAI, or Anthropic API requesting structured JSON, with 1 retry on malformed output."""
    gemini_key = settings.GEMINI_API_KEY or settings.GOOGLE_API_KEY or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    openai_key = settings.OPENAI_API_KEY or os.environ.get("OPENAI_API_KEY")
    anthropic_key = settings.ANTHROPIC_API_KEY or os.environ.get("ANTHROPIC_API_KEY")

    # 1. Gemini API Call via REST
    if gemini_key:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={gemini_key}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "generationConfig": {"response_mime_type": "application/json"}
        }
        for attempt in range(2):
            try:
                with httpx.Client(timeout=20.0) as client:
                    resp = client.post(url, json=payload)
                    resp.raise_for_status()
                    data = resp.json()
                    raw_text = data["candidates"][0]["content"]["parts"][0]["text"]
                    return json.loads(raw_text)
            except Exception as e:
                logger.warning(f"Gemini API attempt {attempt+1} failed: {e}")
                if attempt == 0:
                    payload["contents"].append({"parts": [{"text": "Your previous response was invalid JSON. Respond ONLY with valid JSON matching the specified schema."}]})

    # 2. OpenAI API Call
    elif openai_key and OpenAI:
        for attempt in range(2):
            try:
                client = OpenAI(api_key=openai_key)
                msgs = [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ]
                if attempt == 1:
                    msgs.append({"role": "user", "content": "Your previous output was invalid JSON. Please return valid JSON ONLY."})
                resp = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=msgs,
                    response_format={"type": "json_object"},
                    temperature=0.3
                )
                return json.loads(resp.choices[0].message.content)
            except Exception as e:
                logger.warning(f"OpenAI API attempt {attempt+1} failed: {e}")

    return None


def generate_recommendations(prediction_results: Dict[str, Any], input_payload: Dict[str, Any]) -> RecommendationResponse:
    """Generates validated structured recommendations JSON."""
    user_prompt = f"""Analyze this user's RiskLens prediction and SHAP data to produce structured health recommendations JSON:
PREDICTION RESULTS:
{json.dumps(prediction_results, indent=2)}

INPUT PAYLOAD:
{json.dumps(input_payload, indent=2)}
"""

    json_dict = call_llm_json(user_prompt, RECOMMENDATIONS_SYSTEM_PROMPT)
    if json_dict:
        try:
            return RecommendationResponse(**json_dict)
        except Exception as ve:
            logger.warning(f"Validation of LLM JSON output failed ({ve}). Using clinical fallback.")

    return fallback_recommendations_generator(prediction_results, input_payload)


def generate_chat_reply(user_message: str, history: List[ChatMessage], context: Dict[str, Any]) -> ChatResponse:
    """
    Generates chat reply. Runs pre-LLM safety filter FIRST before every call.
    If matched, skips LLM entirely and returns fixed safe response.
    """
    # PRE-LLM SAFETY FILTER CHECK (Non-negotiable)
    is_matched, safe_reply, is_emergency = check_pre_llm_safety_filters(user_message)
    if is_matched:
        return ChatResponse(
            reply=safe_reply,
            isEmergency=is_emergency,
            skippedLLM=True
        )

    gemini_key = settings.GEMINI_API_KEY or settings.GOOGLE_API_KEY or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    openai_key = settings.OPENAI_API_KEY or os.environ.get("OPENAI_API_KEY")

    full_prompt = f"USER QUESTION: {user_message}\n\nUSER RISKLENS CONTEXT:\n{json.dumps(context, indent=2)}"

    # 1. Gemini LLM Call
    if gemini_key:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={gemini_key}"
            payload = {
                "contents": [{"parts": [{"text": full_prompt}]}],
                "system_instruction": {"parts": [{"text": CHAT_SYSTEM_PROMPT}]}
            }
            with httpx.Client(timeout=15.0) as client:
                resp = client.post(url, json=payload)
                resp.raise_for_status()
                data = resp.json()
                reply_text = data["candidates"][0]["content"]["parts"][0]["text"]
                return ChatResponse(reply=reply_text, isEmergency=False, skippedLLM=False)
        except Exception as e:
            logger.warning(f"Gemini Chat API call failed ({e}). Using fallback.")

    # 2. OpenAI LLM Call
    elif openai_key and OpenAI:
        try:
            client = OpenAI(api_key=openai_key)
            messages = [{"role": "system", "content": CHAT_SYSTEM_PROMPT}]
            if context:
                messages.append({"role": "system", "content": f"CONTEXT:\n{json.dumps(context, indent=2)}"})
            for msg in history[-6:]:
                messages.append({"role": msg.role, "content": msg.content})
            messages.append({"role": "user", "content": user_message})

            resp = client.chat.completions.create(model="gpt-4o-mini", messages=messages, temperature=0.5)
            return ChatResponse(reply=resp.choices[0].message.content, isEmergency=False, skippedLLM=False)
        except Exception as e:
            logger.warning(f"OpenAI Chat API call failed ({e}). Using fallback.")

    # 3. Fallback grounded reply
    diabetes_res = context.get("diabetes", {}) or {} if context else {}
    heart_res = context.get("heartDisease", {}) or {} if context else {}
    d_risk = diabetes_res.get("risk") or {}
    h_risk = heart_res.get("risk") or {}

    d_str = f"{d_risk.get('probability', 0)*100:.1f}%" if d_risk else "Insufficient Data"
    h_str = f"{h_risk.get('probability', 0)*100:.1f}%" if h_risk else "Insufficient Data"

    fallback_reply = (
        f"Based on your RiskLens assessment context, your Diabetes Risk probability is {d_str} "
        f"and Heart Disease Risk probability is {h_str}.\n\n"
        f"To address your question ('{user_message}'): Focus on optimizing your primary SHAP risk factors through balanced nutrition, "
        f"consistent physical activity, and discussing targeted biomarker testing with your physician at your next visit."
    )
    return ChatResponse(reply=fallback_reply, isEmergency=False, skippedLLM=False)
