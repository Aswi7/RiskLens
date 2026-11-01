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
from app.features.predictions.shap_service import generate_two_sentence_why_this_score

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
5. WHY THIS SCORE: You must provide a "whyThisScore" dictionary containing "diabetes" and "heartDisease". Each explanation MUST be exactly two sentences, written strictly from the top factors, with NO numerical values (no numbers, units, or percentages), and NEVER a diagnosis.
6. MUST OUTPUT VALID JSON ONLY matching this exact structure:
{
  "diet": ["Dietary recommendation 1", "Dietary recommendation 2"],
  "exercise": ["Exercise recommendation 1", "Exercise recommendation 2"],
  "sleep": "Sleep and lifestyle recovery guidance",
  "urgency": "low|moderate|high",
  "sharedRiskFactors": ["Shared risk factor 1"] (include only if both disease risks are elevated/moderate),
  "whyThisScore": {
    "diabetes": "Exactly two sentences written only from top factors without numbers and without diagnosis.",
    "heartDisease": "Exactly two sentences written only from top factors without numbers and without diagnosis."
  },
  "disclaimer": "Standard non-diagnostic medical safety disclaimer recommending physician consultation"
}
"""

CHAT_SYSTEM_PROMPT = """You are RiskLens AI Health Assistant, a helpful, safe, and empathetic AI assistant specialized in preventive health education.
You are answering follow-up questions from a user regarding their RiskLens assessment and general medical inquiries.

STRICT SAFETY & CITATION CONSTRAINTS:
1. NO DIAGNOSIS OR MEDICATION: Do not issue clinical diagnoses or prescribe medication dosages.
2. CONTEXT GROUNDING: Ground your answers in the user's RiskLens assessment results, SHAP drivers, and any provided Reference Medical Information.
3. SOURCE CITATIONS: When using content from the "Reference medical information:" section, cite the source document name explicitly using format: [Source: Source Document Name]. If NO reference medical information was provided or relevant, answer using constrained general guidance and DO NOT fabricate citations.
4. CONCISE & EMPATHETIC: Keep answers supportive, clear, and easy to understand.
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


def sanitize_log_message(msg: str) -> str:
    """Masks API keys matching common patterns (AIza..., sk-...) from log strings."""
    if not msg:
        return ""
    s = re.sub(r'AIza[0-9A-Za-z-_]{35}', '[REDACTED_API_KEY]', str(msg))
    s = re.sub(r'sk-[0-9A-Za-z-_]{20,}', '[REDACTED_API_KEY]', s)
    s = re.sub(r'key=[^&\s"\']+', 'key=[REDACTED_KEY]', s)
    return s


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

    d_user_factors = diabetes.get("userFacingFactors") or []
    h_user_factors = heart.get("userFacingFactors") or []
    why_this_score = {
        "diabetes": generate_two_sentence_why_this_score(d_user_factors, "Diabetes", d_high),
        "heartDisease": generate_two_sentence_why_this_score(h_user_factors, "Heart Disease", h_high)
    }

    return RecommendationResponse(
        diet=diet_recs,
        exercise=exercise_recs,
        sleep=sleep_guidance,
        urgency=urgency,
        sharedRiskFactors=shared_factors if shared_factors else None,
        whyThisScore=why_this_score,
        disclaimer=disclaimer
    )


def call_llm_json(prompt: str, system_prompt: str) -> Optional[Dict[str, Any]]:
    """Calls Gemini, OpenAI, or Anthropic API requesting structured JSON, with 1 retry on malformed output."""
    gemini_key = settings.GEMINI_API_KEY or settings.GOOGLE_API_KEY or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    openai_key = settings.OPENAI_API_KEY or os.environ.get("OPENAI_API_KEY")
    anthropic_key = settings.ANTHROPIC_API_KEY or os.environ.get("ANTHROPIC_API_KEY")

    # 1. Gemini API Call via REST
    if gemini_key and gemini_key.startswith("AIza"):
        url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent"
        headers = {"x-goog-api-key": gemini_key}
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "generationConfig": {"response_mime_type": "application/json"}
        }
        for attempt in range(2):
            try:
                with httpx.Client(timeout=4.0) as client:
                    resp = client.post(url, json=payload, headers=headers)
                    resp.raise_for_status()
                    data = resp.json()
                    raw_text = data["candidates"][0]["content"]["parts"][0]["text"]
                    return json.loads(raw_text)
            except Exception as e:
                logger.warning(sanitize_log_message(f"Gemini API attempt {attempt+1} failed: {type(e).__name__}"))
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


def format_rich_onboarding_context(input_payload: Dict[str, Any]) -> str:
    """
    Formats non-ML onboarding steps (Family History by relative, Full Symptoms with severity/duration/frequency,
    Medical History, Mental Wellness, and Health Score) into readable markdown text for LLM prompts.

    IMPORTANT: These fields feed LLM prompt context and MongoDB storage ONLY;
    they do NOT feed the XGBoost/Logistic Regression prediction models.
    """
    if not input_payload:
        return ""

    sections = []

    # 1. Family History by Relative
    fam = input_payload.get("familyHistory") or input_payload.get("family_history_relatives") or {}
    if isinstance(fam, dict) and fam:
        fam_lines = ["FAMILY HISTORY (BY RELATIVE):"]
        for rel, conds in fam.items():
            if conds:
                cond_str = ", ".join(conds) if isinstance(conds, list) else str(conds)
                fam_lines.append(f"- {rel.capitalize()}: {cond_str}")
            else:
                fam_lines.append(f"- {rel.capitalize()}: None reported")
        sections.append("\n".join(fam_lines))
    elif isinstance(fam, list) and fam:
        fam_lines = ["FAMILY HISTORY (BY RELATIVE):"]
        for item in fam:
            rel = item.get("relative", "Relative")
            conds = item.get("conditions", [])
            fam_lines.append(f"- {rel}: {', '.join(conds) if isinstance(conds, list) else str(conds)}")
        sections.append("\n".join(fam_lines))

    # 2. Full Symptom Selector Details
    symptoms = input_payload.get("symptoms") or []
    symp_followups = input_payload.get("symptomFollowups") or {}
    if symptoms:
        symp_lines = ["FULL SYMPTOM SELECTOR (SEVERITY / DURATION / FREQUENCY):"]
        for s in symptoms:
            if isinstance(s, dict):
                name = s.get("symptom") or s.get("name") or s.get("key") or "Symptom"
                sev = s.get("severity", "N/A")
                dur = s.get("duration", "N/A")
                freq = s.get("frequency", "N/A")
                extras = []
                if "increasedThirst" in s or symp_followups.get("increasedThirst"):
                    val = s.get("increasedThirst") if "increasedThirst" in s else symp_followups.get("increasedThirst")
                    extras.append(f"Increased Thirst: {'Yes' if val else 'No'}")
                if "weightLoss" in s or symp_followups.get("weightLoss"):
                    val = s.get("weightLoss") if "weightLoss" in s else symp_followups.get("weightLoss")
                    extras.append(f"Unexplained Weight Loss: {'Yes' if val else 'No'}")
                extra_str = f" [{', '.join(extras)}]" if extras else ""
                symp_lines.append(f"- {name} (Severity: {sev}/5, Duration: {dur}, Frequency: {freq}){extra_str}")
            else:
                symp_lines.append(f"- {s}")
        sections.append("\n".join(symp_lines))

    # 3. Diagnosed Medical History
    med_hist = input_payload.get("medicalHistory") or input_payload.get("medical_history") or []
    if med_hist:
        hist_str = ", ".join(med_hist) if isinstance(med_hist, list) else str(med_hist)
        sections.append(f"DIAGNOSED MEDICAL HISTORY:\n- {hist_str}")

    # 4. Mental Wellness (Optional, Non-Diagnostic Context)
    mw = input_payload.get("mentalWellness") or input_payload.get("mental_wellness") or {}
    if isinstance(mw, dict) and not mw.get("skipped", False):
        mw_lines = ["MENTAL WELLNESS & STRESS (Optional Non-Diagnostic Context):"]
        if "anxious" in mw:
            mw_lines.append(f"- Anxious or Nervous: {'Yes' if mw['anxious'] else 'No'}")
        if "depressed" in mw:
            mw_lines.append(f"- Down or Depressed: {'Yes' if mw['depressed'] else 'No'}")
        if "difficultyConcentrating" in mw or "difficulty_concentrating" in mw:
            val = mw.get("difficultyConcentrating") if "difficultyConcentrating" in mw else mw.get("difficulty_concentrating")
            mw_lines.append(f"- Difficulty Concentrating: {'Yes' if val else 'No'}")
        if "notes" in mw and mw["notes"]:
            mw_lines.append(f"- Wellness Note: {mw['notes']}")
        sections.append("\n".join(mw_lines))

    # 5. Transparent Non-ML Health Score
    hs = input_payload.get("health_score") or input_payload.get("healthScore")
    if isinstance(hs, dict):
        sections.append(f"TRANSPARENT NON-ML HEALTH SCORE:\n- Overall Score: {hs.get('total_score', 'N/A')}/100 ({hs.get('rating', 'N/A')})")

    if not sections:
        return ""

    return "\n\n=== ADDITIONAL NON-ML ONBOARDING INTAKE ===\n" + "\n\n".join(sections)


def generate_recommendations(prediction_results: Dict[str, Any], input_payload: Dict[str, Any]) -> RecommendationResponse:
    """Generates validated structured recommendations JSON enriched with full non-ML intake context."""
    rich_context_block = format_rich_onboarding_context(input_payload)

    user_prompt = f"""Analyze this user's RiskLens prediction, SHAP data, and non-ML intake to produce structured health recommendations JSON:
PREDICTION RESULTS:
{json.dumps(prediction_results, indent=2)}

INPUT PAYLOAD:
{json.dumps(input_payload, indent=2)}{rich_context_block}
"""

    json_dict = call_llm_json(user_prompt, RECOMMENDATIONS_SYSTEM_PROMPT)
    if json_dict:
        try:
            if "whyThisScore" not in json_dict or not json_dict["whyThisScore"]:
                d_res = prediction_results.get("diabetes", {})
                h_res = prediction_results.get("heartDisease", {})
                json_dict["whyThisScore"] = {
                    "diabetes": generate_two_sentence_why_this_score(d_res.get("userFacingFactors", []), "Diabetes", d_res.get("risk", {}).get("isHighRisk", False)),
                    "heartDisease": generate_two_sentence_why_this_score(h_res.get("userFacingFactors", []), "Heart Disease", h_res.get("risk", {}).get("isHighRisk", False))
                }
            return RecommendationResponse(**json_dict)
        except Exception as ve:
            logger.warning(f"Validation of LLM JSON output failed ({ve}). Using clinical fallback.")

    return fallback_recommendations_generator(prediction_results, input_payload)


def generate_chat_reply(
    user_message: str,
    history: List[ChatMessage],
    context: Dict[str, Any],
    retrieved_chunks: Optional[List[Dict[str, Any]]] = None
) -> ChatResponse:
    """
    Generates chat reply with optional RAG knowledge grounding and rich non-ML intake context.
    Runs pre-LLM safety filter FIRST before every call.
    If matched, skips LLM entirely and returns fixed safe response without calling RAG.
    """
    # PRE-LLM SAFETY FILTER CHECK (Non-negotiable)
    is_matched, safe_reply, is_emergency = check_pre_llm_safety_filters(user_message)
    if is_matched:
        return ChatResponse(
            reply=safe_reply,
            isEmergency=is_emergency,
            skippedLLM=True,
            citations=[]
        )

    gemini_key = settings.GEMINI_API_KEY or settings.GOOGLE_API_KEY or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    openai_key = settings.OPENAI_API_KEY or os.environ.get("OPENAI_API_KEY")

    retrieved_chunks = retrieved_chunks or []
    citations = []
    rag_text_block = ""

    if retrieved_chunks:
        rag_lines = ["\nReference medical information:"]
        seen_sources = set()
        for idx, chunk in enumerate(retrieved_chunks, 1):
            src_name = chunk.get("sourceDocument", "Medical Reference")
            src_url = chunk.get("sourceUrl", "")
            rag_lines.append(f"[{idx}] Source Document: {src_name}\nContent: {chunk.get('chunkText', '')}\n")
            if src_name not in seen_sources:
                seen_sources.add(src_name)
                citations.append({"sourceDocument": src_name, "sourceUrl": src_url})
        rag_text_block = "\n".join(rag_lines)

    rich_onboarding_block = format_rich_onboarding_context(context if isinstance(context, dict) else {})

    full_prompt = f"USER QUESTION: {user_message}\n\nUSER RISKLENS CONTEXT:\n{json.dumps(context, indent=2)}{rich_onboarding_block}{rag_text_block}"


    # 1. Gemini LLM Call
    if gemini_key and gemini_key.startswith("AIza"):
        try:
            url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent"
            headers = {"x-goog-api-key": gemini_key}
            payload = {
                "contents": [{"parts": [{"text": full_prompt}]}],
                "system_instruction": {"parts": [{"text": CHAT_SYSTEM_PROMPT}]}
            }
            with httpx.Client(timeout=4.0) as client:
                resp = client.post(url, json=payload, headers=headers)
                resp.raise_for_status()
                data = resp.json()
                reply_text = data["candidates"][0]["content"]["parts"][0]["text"]
                return ChatResponse(reply=reply_text, isEmergency=False, skippedLLM=False, citations=citations)
        except Exception as e:
            logger.warning(sanitize_log_message(f"Gemini Chat API call failed ({type(e).__name__}). Using fallback."))


    # 2. OpenAI LLM Call
    elif openai_key and OpenAI:
        try:
            client = OpenAI(api_key=openai_key)
            messages = [{"role": "system", "content": CHAT_SYSTEM_PROMPT}]
            if context or rag_text_block:
                ctx_text = f"PERSONAL CONTEXT:\n{json.dumps(context, indent=2)}{rag_text_block}"
                messages.append({"role": "system", "content": ctx_text})
            for msg in history[-6:]:
                messages.append({"role": msg.role, "content": msg.content})
            messages.append({"role": "user", "content": user_message})

            resp = client.chat.completions.create(model="gpt-4o-mini", messages=messages, temperature=0.5)
            return ChatResponse(reply=resp.choices[0].message.content, isEmergency=False, skippedLLM=False, citations=citations)
        except Exception as e:
            logger.warning(f"OpenAI Chat API call failed ({e}). Using fallback.")

    # 3. Intelligent Grounded Medical Knowledge Base & Clinical Fallback
    msg_lower = user_message.lower()

    if any(k in msg_lower for k in ["heart attack", "myocardial infarction", "cardiac arrest"]):
        medical_guidance = (
            "Classic symptoms of a **Heart Attack (Myocardial Infarction)** include:\n\n"
            "• **Chest Discomfort**: Pressure, squeezing, fullness, tightness, or burning pain in the center or left side of the chest that lasts several minutes, or fades and returns.\n"
            "• **Radiating Discomfort**: Pain spreading to one or both arms (often the left arm), shoulders, neck, jaw, back, or upper stomach.\n"
            "• **Shortness of Breath (Dyspnea)**: Difficulty breathing, which can occur before, during, or even without chest discomfort.\n"
            "• **Cold Sweats & Lightheadedness**: Breaking out in a sudden cold sweat, unexpected dizziness, or fainting.\n"
            "• **Nausea & Indigestion**: Unexplained stomach upset or vomiting.\n"
            "• **Atypical Symptoms in Women**: Women are statistically more likely to present with atypical signs—such as extreme exhaustion, sharp back or jaw pain, and shortness of breath without classic crushing chest pain.\n\n"
            "⚠️ **Emergency Protocol**: If you or someone you are with experiences these signs, call emergency medical services (such as 911 or your local emergency number) immediately. Every minute counts."
        )
    elif any(k in msg_lower for k in ["diabetes symptom", "signs of diabetes", "high blood sugar", "hyperglycemia"]):
        medical_guidance = (
            "Common symptoms of **Type 2 Diabetes & Hyperglycemia (High Blood Sugar)** include:\n\n"
            "• **Frequent Urination (Polyuria)**: Need to urinate often, especially waking up multiple times at night.\n"
            "• **Excessive Thirst (Polydipsia)**: Persistent unquenchable thirst despite drinking water.\n"
            "• **Unexplained Weight Loss**: Losing weight without intentional dietary restriction.\n"
            "• **Chronic Fatigue & Weakness**: Cells cannot absorb circulating glucose to produce energy.\n"
            "• **Blurred Vision**: Fluid shifts inside the lens of the eye caused by elevated glucose.\n"
            "• **Slow-Healing Sores**: Cuts or bruises taking unusually long to heal, or frequent skin infections.\n\n"
            "If you notice these patterns, consult a physician for fasting glucose and HbA1c testing."
        )
    elif any(k in msg_lower for k in ["triglyceride", "cholesterol", "lipid"]):
        medical_guidance = (
            "Key clinical insights on **Blood Lipids & Cardiovascular Health**:\n\n"
            "• **Triglycerides**: Normal is under 150 mg/dL. Severely elevated triglycerides (>500 or >1,000 mg/dL) accelerate arterial plaque and significantly increase the acute risk of pancreatitis.\n"
            "• **HDL ('Good' Cholesterol)**: Protective against heart disease by removing circulating fat particles. Desirable is >50 mg/dL for females and >40 mg/dL for males.\n"
            "• **Actionable Next Steps**: Eliminating simple sugars, refined carbs, and alcohol while adding regular aerobic exercise and prescription lipid-lowering therapy under a doctor's care."
        )
    elif any(k in msg_lower for k in ["blood pressure", "hypertension", "systolic", "diastolic", "high bp"]):
        medical_guidance = (
            "Key guidelines on **Blood Pressure & Arterial Health**:\n\n"
            "• **Normal Blood Pressure**: Systolic < 120 mmHg and Diastolic < 80 mmHg.\n"
            "• **Elevated / Stage 1 Hypertension**: Systolic 120–139 mmHg or Diastolic 80–89 mmHg.\n"
            "• **Stage 2 Hypertension**: Systolic ≥ 140 mmHg or Diastolic ≥ 90 mmHg.\n"
            "• **Why It Matters**: Chronic hypertension stiffens arteries, straining the heart and accelerating vascular damage.\n"
            "• **Evidence-Based Reductions**: Adopting the DASH diet (rich in potassium and magnesium), moderating sodium (<2,300 mg/day), regular aerobic exercise, and managing chronic stress."
        )
    elif any(k in msg_lower for k in ["diet", "food", "eat", "nutrition", "sugar", "carbs", "meal"]):
        medical_guidance = (
            "Evidence-based **Nutritional Guidance for Cardiometabolic Health**:\n\n"
            "• **Focus on Whole Foods**: Prioritize vegetables, legumes, whole grains, nuts, seeds, and lean proteins (fish, poultry).\n"
            "• **Healthy Fats**: Replace saturated and trans fats with monounsaturated fats (extra virgin olive oil, avocados) and omega-3 fatty acids.\n"
            "• **Blood Sugar & Triglyceride Control**: Severely limit sugar-sweetened beverages, refined flour, sweets, and ultra-processed snacks that trigger rapid insulin spikes and hepatic fat synthesis.\n"
            "• **Fiber Intake**: Aim for 25–35 grams of dietary fiber daily to slow carbohydrate absorption and assist in cholesterol clearance."
        )
    elif any(k in msg_lower for k in ["exercise", "workout", "fitness", "walking", "steps", "physical activity"]):
        medical_guidance = (
            "Clinical recommendations for **Physical Activity & Longevity**:\n\n"
            "• **Aerobic Exercise**: At least 150 minutes of moderate-intensity aerobic exercise (e.g., brisk walking, cycling) or 75 minutes of vigorous activity per week.\n"
            "• **Resistance Training**: Incorporate muscle-strengthening exercises at least 2 days per week to enhance cellular glucose uptake and insulin sensitivity.\n"
            "• **Daily Step Target**: Aiming for 7,000–10,000 steps daily reduces cardiovascular mortality and maintains vascular elasticity."
        )
    elif any(k in msg_lower for k in ["sleep", "stress", "insomnia", "cortisol", "tired", "fatigue"]):
        medical_guidance = (
            "Impact of **Sleep & Stress on Metabolic Health**:\n\n"
            "• **Sleep Duration**: 7 to 9 hours of restorative, uninterrupted sleep is essential. Sleep deprivation elevates evening cortisol and disrupts appetite hormones (ghrelin and leptin).\n"
            "• **Sleep Hygiene**: Keep a consistent sleep schedule, eliminate blue-light screens 1 hour before bed, and keep the bedroom cool and dark.\n"
            "• **Stress Reduction**: Chronic psychological stress triggers sympathetic nervous system activation, elevating resting blood pressure and resting heart rate."
        )
    elif any(k in msg_lower for k in ["hba1c", "glucose", "lab", "test", "biomarker"]):
        medical_guidance = (
            "Understanding your **Key Clinical Lab Biomarkers**:\n\n"
            "• **Fasting Glucose**: 70–99 mg/dL is Normal; 100–125 mg/dL indicates Prediabetes; ≥126 mg/dL indicates Diabetes.\n"
            "• **HbA1c**: Reflects average blood sugar over 2–3 months. Below 5.7% is Normal; 5.7%–6.4% is Prediabetes; ≥6.5% indicates Diabetes.\n"
            "• **Lipid Panel**: Total Cholesterol (<200 mg/dL desirable), Triglycerides (<150 mg/dL normal), and HDL (>50 mg/dL for women, >40 mg/dL for men)."
        )
    else:
        medical_guidance = (
            f"To address your inquiry ('{user_message}'): In preventive healthcare, sustaining cardiovascular and metabolic wellness "
            f"relies on consistent moderate physical activity (150+ minutes weekly), a nutrient-rich Mediterranean-style diet, "
            f"restorative sleep (7–8 hours), and periodic clinical biomarker monitoring with your healthcare provider."
        )

    diabetes_res = context.get("diabetes", {}) or {} if context else {}
    heart_res = context.get("heartDisease", {}) or {} if context else {}
    d_risk = diabetes_res.get("risk") or {}
    h_risk = heart_res.get("risk") or {}

    d_str = f"{d_risk.get('probability', 0)*100:.1f}%" if d_risk else None
    h_str = f"{h_risk.get('probability', 0)*100:.1f}%" if h_risk else None

    context_prefix = ""
    if d_str and h_str:
        context_prefix = f"*RiskLens Context: Your current assessed Diabetes Risk is {d_str} and Heart Disease Risk is {h_str}.*\n\n"

    fallback_reply = f"{context_prefix}{medical_guidance}"

    if citations:
        sources_list = ", ".join([c["sourceDocument"] for c in citations])
        fallback_reply += f"\n\n[Source: {sources_list}]"

    return ChatResponse(reply=fallback_reply, isEmergency=False, skippedLLM=False, citations=citations)
