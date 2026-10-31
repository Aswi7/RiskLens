import json
from pathlib import Path
from typing import Dict, Any, List, Optional

# Load mappings
MAPPINGS_FILE = Path(__file__).resolve().parent / "feature_mappings.json"
with open(MAPPINGS_FILE, "r", encoding="utf-8") as f:
    FEATURE_MAPPINGS = json.load(f)["features"]

AGE_BUCKET_MAP = {
    1: "18-24 years",
    2: "25-29 years",
    3: "30-34 years",
    4: "35-39 years",
    5: "40-44 years",
    6: "45-49 years",
    7: "50-54 years",
    8: "55-59 years",
    9: "60-64 years",
    10: "65-69 years",
    11: "70-74 years",
    12: "75-79 years",
    13: "80+ years"
}

GEN_HLTH_MAP = {
    1: "Excellent",
    2: "Very Good",
    3: "Good",
    4: "Fair",
    5: "Poor"
}


def extract_raw_feature_value(payload: Dict[str, Any], feature_key: str) -> Any:
    """Extracts raw value from payload handling case variants and fallbacks."""
    if feature_key in payload and payload[feature_key] is not None:
        return payload[feature_key]

    key_lower = feature_key.lower()
    for k, v in payload.items():
        if k.lower() == key_lower and v is not None:
            return v

    # Specific common mappings
    if feature_key in ("Age", "age"):
        return payload.get("Age") or payload.get("age")
    if feature_key in ("Sex", "sex"):
        return payload.get("Sex") or payload.get("sex")
    if feature_key == "trestbps":
        return payload.get("trestbps") or payload.get("bp_systolic") or payload.get("bpSystolic")
    if feature_key == "chol":
        return payload.get("chol") or payload.get("total_cholesterol") or payload.get("totalCholesterol")
    if feature_key == "fbs":
        return payload.get("fbs") or (1 if payload.get("fasting_glucose", 0) > 120 else 0)

    # Chest pain one-hot
    if feature_key.startswith("cp_"):
        cp_idx = feature_key.split("_")[-1]
        raw_cp = payload.get("cp")
        if raw_cp is not None:
            return 1 if str(raw_cp) == cp_idx else 0

    return None


def format_user_readable_value(feature_key: str, raw_val: Any) -> str:
    """Formats raw numerical input values into non-technical, human-readable words."""
    if raw_val is None:
        return "Not provided"

    # 1. BMI
    if feature_key == "BMI":
        try:
            return f"BMI {int(round(float(raw_val)))}"
        except Exception:
            return f"BMI {raw_val}"

    # 2. Blood Pressure (Resting / HighBP)
    if feature_key == "trestbps":
        try:
            return f"{int(round(float(raw_val)))} mmHg"
        except Exception:
            return f"{raw_val} mmHg"

    if feature_key == "HighBP":
        return "Yes" if float(raw_val) >= 1.0 else "No"

    # 3. Cholesterol
    if feature_key == "chol":
        try:
            return f"{int(round(float(raw_val)))} mg/dL"
        except Exception:
            return f"{raw_val} mg/dL"

    if feature_key == "HighChol":
        return "Yes" if float(raw_val) >= 1.0 else "No"

    # 4. Lifestyle Binary Flags
    if feature_key == "Smoker":
        return "Yes" if float(raw_val) >= 1.0 else "No"

    if feature_key == "PhysActivity":
        return "Active" if float(raw_val) >= 1.0 else "Inactive"

    if feature_key == "Fruits":
        return "Daily" if float(raw_val) >= 1.0 else "Infrequent"

    if feature_key == "Veggies":
        return "Daily" if float(raw_val) >= 1.0 else "Infrequent"

    if feature_key == "HvyAlcoholConsump":
        return "Yes" if float(raw_val) >= 1.0 else "No"

    if feature_key in ("Stroke", "HeartDiseaseorAttack", "DiffWalk", "exang", "fbs"):
        return "Yes" if float(raw_val) >= 1.0 else "No"

    # 5. General Health Rating
    if feature_key == "GenHlth":
        try:
            return GEN_HLTH_MAP.get(int(raw_val), "Moderate")
        except Exception:
            return str(raw_val)

    # 6. Days per month
    if feature_key in ("MentHlth", "PhysHlth"):
        try:
            days = int(round(float(raw_val)))
            return f"{days} days / month" if days != 1 else "1 day / month"
        except Exception:
            return f"{raw_val} days"

    # 7. Age
    if feature_key in ("Age", "age"):
        try:
            num = int(round(float(raw_val)))
            if 1 <= num <= 13:
                return AGE_BUCKET_MAP.get(num, f"{num} years")
            return f"{num} years"
        except Exception:
            return str(raw_val)

    # 8. Sex
    if feature_key in ("Sex", "sex"):
        try:
            return "Male" if float(raw_val) == 1.0 else "Female"
        except Exception:
            return str(raw_val)

    # 9. Chest pain patterns
    if feature_key.startswith("cp_"):
        return "Reported" if float(raw_val) >= 1.0 else "Not reported"

    return str(raw_val)


def post_process_shap_factors(
    shap_dict: Optional[Dict[str, float]],
    input_payload: Dict[str, Any],
    disease_type: str = "diabetes"
) -> List[Dict[str, Any]]:
    """
    Transforms raw model SHAP feature contributions into an intuitive, user-facing list:
    - Retains only the top 5 features by absolute SHAP value.
    - Calculates relative strength: Strong (>=35%), Moderate (15-35%), Slight (<15%).
    - Maps to plain labels, readable user words, direction ("raises" / "lowers"),
      changeability ("changeable" / "fixed"), and a one-line explanatory note.
    - Keeps rawShap for technical inspection.
    """
    if not shap_dict:
        return []

    # 1. Sort by absolute SHAP value descending
    sorted_items = sorted(shap_dict.items(), key=lambda item: abs(item[1]), reverse=True)

    # 2. Keep top 5 features
    top_5 = sorted_items[:5]
    total_abs_shap = sum(abs(v) for _, v in top_5)

    user_facing_list: List[Dict[str, Any]] = []

    for feat_key, raw_shap in top_5:
        # Strength calculation based on share of top 5 total absolute SHAP
        share = (abs(raw_shap) / total_abs_shap) if total_abs_shap > 0 else 0.0
        if share >= 0.35:
            strength = "Strong"
        elif share >= 0.15:
            strength = "Moderate"
        else:
            strength = "Slight"

        # Direction from SHAP sign: positive means higher disease risk
        direction = "raises" if raw_shap > 0 else "lowers"

        # Lookup feature specifications
        mapping = FEATURE_MAPPINGS.get(feat_key, {})
        plain_label = mapping.get("plainLabel", feat_key)
        changeability = mapping.get("changeability", "changeable")
        note = mapping.get("note", "Contributing factor in statistical risk evaluation.")

        # Human-readable user value
        raw_user_val = extract_raw_feature_value(input_payload, feat_key)
        user_val_str = format_user_readable_value(feat_key, raw_user_val)

        user_facing_list.append({
            "featureKey": feat_key,
            "plainLabel": plain_label,
            "userValue": user_val_str,
            "direction": direction,
            "strength": strength,
            "changeability": changeability,
            "note": note,
            "rawShap": round(float(raw_shap), 4)
        })

    return user_facing_list


def generate_two_sentence_why_this_score(
    top_factors: List[Dict[str, Any]],
    disease_name: str,
    is_high_risk: bool
) -> str:
    """
    Generates a clear two-sentence explanation for why a score looks the way it does.
    Strict constraints:
    - Exactly two sentences.
    - Grounded only in the top factors.
    - Zero numerical figures (no BMI numbers, percentages, or units).
    - Zero clinical diagnosis.
    """
    if not top_factors:
        return (
            f"Your {disease_name.lower()} risk estimate reflects the overall balance of your self-reported health intake. "
            "Maintaining regular physical activity and a balanced whole-food diet supports long-term metabolic health."
        )

    raising = [f["plainLabel"].lower() for f in top_factors if f["direction"] == "raises"]
    lowering = [f["plainLabel"].lower() for f in top_factors if f["direction"] == "lowers"]

    # Sentence 1: Factors driving or raising the risk
    if raising:
        if len(raising) >= 2:
            s1 = f"Your {disease_name.lower()} assessment is primarily influenced by your {raising[0]} and {raising[1]}, which contribute to your overall risk score."
        else:
            s1 = f"Your {disease_name.lower()} assessment is primarily influenced by your {raising[0]}, which increases your baseline risk calculation."
    else:
        s1 = f"Your {disease_name.lower()} assessment indicates favorable baseline measurements across your primary health inputs."

    # Sentence 2: Protective or lowering factors
    if lowering:
        if len(lowering) >= 2:
            s2 = f"On the other hand, your {lowering[0]} along with your {lowering[1]} actively work to lower your score and protect your long-term health."
        else:
            s2 = f"On the other hand, your {lowering[0]} helps balance these factors and works to lower your overall score."
    else:
        if is_high_risk:
            s2 = "Focusing on manageable lifestyle habits like daily physical movement and nutritious eating can help lower this score over time."
        else:
            s2 = "Continuing your healthy daily routines will help keep this statistical score in a favorable range."

    return f"{s1} {s2}"
