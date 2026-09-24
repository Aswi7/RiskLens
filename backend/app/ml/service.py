import numpy as np
from typing import Dict, Any, Tuple, List
from app.ml.loader import ml_loader


def map_age_to_cdc_bucket(age: float) -> int:
    """
    Maps raw numerical age into CDC BRFSS 13-category ordinal bucket scheme.
    If age is already an integer in range [1, 13], returns it unchanged.
    """
    if 1 <= age <= 13 and isinstance(age, int):
        return age
    
    if age < 25:
        return 1
    elif 25 <= age <= 29:
        return 2
    elif 30 <= age <= 34:
        return 3
    elif 35 <= age <= 39:
        return 4
    elif 40 <= age <= 44:
        return 5
    elif 45 <= age <= 49:
        return 6
    elif 50 <= age <= 54:
        return 7
    elif 55 <= age <= 59:
        return 8
    elif 60 <= age <= 64:
        return 9
    elif 65 <= age <= 69:
        return 10
    elif 70 <= age <= 74:
        return 11
    elif 75 <= age <= 79:
        return 12
    else:  # 80+
        return 13


def extract_field_value(payload: Dict[str, Any], target_field: str) -> Any:
    """
    Case-insensitive & alias-tolerant field extractor.
    Lookup order: exact match, lowercase, camelCase, snake_case.
    """
    if target_field in payload:
        return payload[target_field]
    
    lower_target = target_field.lower()
    for key, val in payload.items():
        if key.lower() == lower_target:
            return val
        if lower_target == "highbp" and key.lower() in ("high_bp", "highbp"):
            return val
        if lower_target == "highchol" and key.lower() in ("high_chol", "highchol"):
            return val
        if lower_target == "physactivity" and key.lower() in ("phys_activity", "physical_activity"):
            return val
        if lower_target == "hvyalcoholconsump" and key.lower() in ("hvy_alcohol_consump", "heavy_alcohol"):
            return val
        if lower_target == "heartdiseaseorattack" and key.lower() in ("heart_disease", "heartdiseaseorattack"):
            return val
        if lower_target == "diffwalk" and key.lower() in ("diff_walk", "diffwalk"):
            return val
        if lower_target == "genhlth" and key.lower() in ("gen_hlth", "general_health"):
            return val
        if lower_target == "menthlth" and key.lower() in ("ment_hlth", "mental_health"):
            return val
        if lower_target == "physhlth" and key.lower() in ("phys_hlth", "physical_health"):
            return val
            
    return None


def predict_diabetes_risk(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Independent processing pipeline for Diabetes Risk Prediction (XGBoost).
    - Unscaled raw inputs.
    - Custom decision threshold = 0.4 (from diabetes_meta.json).
    - SHAP TreeExplainer.
    """
    required_features = ml_loader.diabetes_meta.get("features", [])
    missing_fields = []
    feature_values = []

    for feat in required_features:
        val = extract_field_value(payload, feat)
        if val is None:
            missing_fields.append(feat)
        else:
            if feat == "Age":
                val = map_age_to_cdc_bucket(float(val))
            feature_values.append(float(val))

    if missing_fields:
        return {
            "risk": None,
            "shapValues": None,
            "status": "insufficient_data",
            "missingFields": missing_fields
        }

    # Construct input vector (1, 16)
    input_vector = np.array([feature_values], dtype=np.float32)

    # Inference with XGBoost
    proba = float(ml_loader.diabetes_model.predict_proba(input_vector)[0][1])
    threshold = float(ml_loader.diabetes_meta.get("decision_threshold", 0.4))
    is_high_risk = proba >= threshold
    risk_level = "High Risk" if is_high_risk else "Low Risk"

    # SHAP TreeExplainer
    shap_results = ml_loader.diabetes_explainer(input_vector)
    shap_raw = shap_results.values[0]
    shap_dict = {
        feat: round(float(val), 4)
        for feat, val in zip(required_features, shap_raw)
    }

    return {
        "risk": {
            "probability": round(proba, 4),
            "isHighRisk": is_high_risk,
            "riskLevel": risk_level,
            "threshold": threshold
        },
        "shapValues": shap_dict,
        "status": "success"
    }


def predict_heart_disease_risk(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Independent processing pipeline for Heart Disease Risk Prediction (Logistic Regression).
    - One-hot encodes 'cp' into cp_0, cp_1, cp_2, cp_3.
    - MANDATORY scaling using heart_scaler.joblib.
    - Decision threshold = 0.5.
    - SHAP LinearExplainer.
    """
    raw_required = ml_loader.heart_meta.get("features_original", ["age", "sex", "cp", "trestbps", "chol", "fbs", "exang"])
    missing_fields = []
    raw_dict = {}

    for feat in raw_required:
        val = extract_field_value(payload, feat)
        if val is None:
            missing_fields.append(feat)
        else:
            raw_dict[feat] = float(val)

    if missing_fields:
        return {
            "risk": None,
            "shapValues": None,
            "status": "insufficient_data",
            "missingFields": missing_fields
        }

    # One-hot encode cp (0, 1, 2, 3)
    cp_val = int(raw_dict["cp"])
    cp_0 = 1.0 if cp_val == 0 else 0.0
    cp_1 = 1.0 if cp_val == 1 else 0.0
    cp_2 = 1.0 if cp_val == 2 else 0.0
    cp_3 = 1.0 if cp_val == 3 else 0.0

    encoded_features = ml_loader.heart_meta.get(
        "features_encoded",
        ["age", "sex", "trestbps", "chol", "fbs", "exang", "cp_0", "cp_1", "cp_2", "cp_3"]
    )

    encoded_map = {
        "age": raw_dict["age"],
        "sex": raw_dict["sex"],
        "trestbps": raw_dict["trestbps"],
        "chol": raw_dict["chol"],
        "fbs": raw_dict["fbs"],
        "exang": raw_dict["exang"],
        "cp_0": cp_0,
        "cp_1": cp_1,
        "cp_2": cp_2,
        "cp_3": cp_3,
    }

    input_encoded = np.array([[encoded_map[feat] for feat in encoded_features]], dtype=np.float32)

    # MANDATORY Scaling via heart_scaler.joblib
    input_scaled = ml_loader.heart_scaler.transform(input_encoded)

    # Inference with Logistic Regression
    proba = float(ml_loader.heart_model.predict_proba(input_scaled)[0][1])
    threshold = 0.5
    is_high_risk = proba >= threshold
    risk_level = "High Risk" if is_high_risk else "Low Risk"

    # SHAP LinearExplainer
    shap_results = ml_loader.heart_explainer(input_scaled)
    shap_raw = shap_results.values[0]
    shap_dict = {
        feat: round(float(val), 4)
        for feat, val in zip(encoded_features, shap_raw)
    }

    return {
        "risk": {
            "probability": round(proba, 4),
            "isHighRisk": is_high_risk,
            "riskLevel": risk_level,
            "threshold": threshold
        },
        "shapValues": shap_dict,
        "status": "success"
    }


def process_prediction(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Runs predictions independently for both Diabetes and Heart Disease."""
    diabetes_res = predict_diabetes_risk(payload)
    heart_res = predict_heart_disease_risk(payload)

    return {
        "diabetes": diabetes_res,
        "heartDisease": heart_res
    }
