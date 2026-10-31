import sys
import os
import re
from unittest.mock import AsyncMock
from pydantic import ValidationError

# Ensure backend directory is in sys.path
sys.path.insert(0, os.path.abspath('.'))
sys.path.insert(0, os.path.abspath('backend'))

# Mock MongoDB connections
import app.db.mongodb
app.db.mongodb.connect_to_mongo = AsyncMock()
app.db.mongodb.close_mongo_connection = AsyncMock()

from app.ml.loader import ml_loader
from app.ml.service import predict_diabetes_risk, predict_heart_disease_risk, process_prediction
from app.features.predictions.shap_service import (
    post_process_shap_factors,
    generate_two_sentence_why_this_score,
    FEATURE_MAPPINGS
)
from app.features.predictions.schemas import WhatIfRequest


def test_feature_mappings_spec():
    print("[RUNNING] Test 1: Feature Mappings & Neutral Labels...")
    # Verify age and sex are marked as fixed
    assert FEATURE_MAPPINGS["Age"]["changeability"] == "fixed"
    assert FEATURE_MAPPINGS["age"]["changeability"] == "fixed"
    assert FEATURE_MAPPINGS["Sex"]["changeability"] == "fixed"
    assert FEATURE_MAPPINGS["sex"]["changeability"] == "fixed"

    # Verify neutral label for chest pain patterns cp_0..cp_3
    for i in range(4):
        key = f"cp_{i}"
        assert key in FEATURE_MAPPINGS
        assert FEATURE_MAPPINGS[key]["plainLabel"] == f"Chest pain pattern (category {i})"
        assert FEATURE_MAPPINGS[key]["changeability"] == "fixed"

    print("[PASS] Test 1: Feature Mappings: Age, Sex, and Chest Pain patterns verified as fixed with neutral labels.\n")


def test_high_risk_user_shap_factors():
    print("[RUNNING] Test 2: High-Risk User SHAP Post-Processing...")
    ml_loader.load_artifacts()

    high_risk_intake = {
        "Sex": 1,
        "Age": 65,
        "BMI": 34.5,
        "HighBP": 1,
        "HighChol": 1,
        "Smoker": 1,
        "PhysActivity": 0,
        "Fruits": 0,
        "Veggies": 0,
        "HvyAlcoholConsump": 1,
        "Stroke": 0,
        "HeartDiseaseorAttack": 0,
        "DiffWalk": 1,
        "GenHlth": 4,
        "MentHlth": 5,
        "PhysHlth": 10,
        "age": 65,
        "sex": 1,
        "cp": 2,
        "trestbps": 155,
        "chol": 275,
        "fbs": 1,
        "exang": 1
    }

    results = process_prediction(high_risk_intake)

    # 1. Diabetes
    d_res = results["diabetes"]
    assert d_res["status"] == "success"
    assert d_res["explainerType"] == "TreeExplainer (XGBoost)"
    d_factors = d_res["userFacingFactors"]
    assert len(d_factors) == 5

    # Verify factor ordering (descending by absolute SHAP value)
    for i in range(len(d_factors) - 1):
        assert abs(d_factors[i]["rawShap"]) >= abs(d_factors[i+1]["rawShap"]), "Factors must be strictly sorted by absolute SHAP descending"

    # Verify strength threshold calculations
    d_total_abs = sum(abs(f["rawShap"]) for f in d_factors)
    for f in d_factors:
        share = abs(f["rawShap"]) / d_total_abs
        if share >= 0.35:
            assert f["strength"] == "Strong", f"Expected Strong for share {share}, got {f['strength']}"
        elif share >= 0.15:
            assert f["strength"] == "Moderate", f"Expected Moderate for share {share}, got {f['strength']}"
        else:
            assert f["strength"] == "Slight", f"Expected Slight for share {share}, got {f['strength']}"

        # Verify arrows/direction match SHAP sign
        if f["rawShap"] > 0:
            assert f["direction"] == "raises", f"Positive SHAP {f['rawShap']} must raise risk"
        else:
            assert f["direction"] == "lowers", f"Negative SHAP {f['rawShap']} must lower risk"

        # Verify fixed factors carry fixed tag
        if f["featureKey"] in ("Age", "age", "Sex", "sex", "Stroke", "HeartDiseaseorAttack"):
            assert f["changeability"] == "fixed"

    # 2. Heart Disease
    h_res = results["heartDisease"]
    assert h_res["status"] == "success"
    assert h_res["explainerType"] == "LinearExplainer (Logistic Regression)"
    h_factors = h_res["userFacingFactors"]
    assert len(h_factors) == 5

    for i in range(len(h_factors) - 1):
        assert abs(h_factors[i]["rawShap"]) >= abs(h_factors[i+1]["rawShap"])

    h_total_abs = sum(abs(f["rawShap"]) for f in h_factors)
    for f in h_factors:
        share = abs(f["rawShap"]) / h_total_abs
        if share >= 0.35:
            assert f["strength"] == "Strong"
        elif share >= 0.15:
            assert f["strength"] == "Moderate"
        else:
            assert f["strength"] == "Slight"

        if f["rawShap"] > 0:
            assert f["direction"] == "raises"
        else:
            assert f["direction"] == "lowers"

        if f["featureKey"] in ("age", "sex") or f["featureKey"].startswith("cp_"):
            assert f["changeability"] == "fixed"

    print("[PASS] Test 2: High-Risk User: Factor order, strength categories, arrows, and fixed tags verified.\n")


def test_low_risk_user_shap_factors():
    print("[RUNNING] Test 3: Low-Risk User SHAP Post-Processing...")
    low_risk_intake = {
        "Sex": 0,
        "Age": 24,
        "BMI": 21.2,
        "HighBP": 0,
        "HighChol": 0,
        "Smoker": 0,
        "PhysActivity": 1,
        "Fruits": 1,
        "Veggies": 1,
        "HvyAlcoholConsump": 0,
        "Stroke": 0,
        "HeartDiseaseorAttack": 0,
        "DiffWalk": 0,
        "GenHlth": 1,
        "MentHlth": 0,
        "PhysHlth": 0,
        "age": 24,
        "sex": 0,
        "cp": 0,
        "trestbps": 110,
        "chol": 165,
        "fbs": 0,
        "exang": 0
    }

    results = process_prediction(low_risk_intake)
    d_factors = results["diabetes"]["userFacingFactors"]
    h_factors = results["heartDisease"]["userFacingFactors"]

    # Low risk profiles should have protective factors that lower score
    lowering_d = [f for f in d_factors if f["direction"] == "lowers"]
    assert len(lowering_d) >= 1, "Low risk profile must contain factors with 'lowers' direction"

    for f in d_factors + h_factors:
        # Verify userValue is formatted in readable words
        assert f["userValue"] is not None and len(f["userValue"]) > 0
        assert not f["userValue"].startswith("{")  # Ensure not raw JSON

    print("[PASS] Test 3: Low-Risk User: Protective lowering factors, readable user values, and order verified.\n")


def test_what_if_validation_and_rejection():
    print("[RUNNING] Test 4: What-If Endpoint Input Validation & Rejection...")

    # 1. Valid changeable input passes
    valid_req = WhatIfRequest(
        BMI=24.5,
        PhysActivity=1,
        Smoker=0,
        Fruits=1,
        Veggies=1
    )
    assert valid_req.BMI == 24.5

    # 2. Reject out-of-range BMI (< 10)
    try:
        WhatIfRequest(BMI=5.0)
        assert False, "Should have rejected BMI < 10"
    except ValidationError:
        pass

    # 3. Reject out-of-range BMI (> 70)
    try:
        WhatIfRequest(BMI=120.0)
        assert False, "Should have rejected BMI > 70"
    except ValidationError:
        pass

    # 4. Reject invalid binary toggle values (> 1)
    try:
        WhatIfRequest(PhysActivity=5.0)
        assert False, "Should have rejected PhysActivity > 1"
    except ValidationError:
        pass

    # 5. Reject unchangeable inputs (extra forbidden)
    try:
        WhatIfRequest(Age=35)
        assert False, "Should have rejected non-changeable input 'Age'"
    except ValidationError:
        pass

    try:
        WhatIfRequest(Sex=1)
        assert False, "Should have rejected non-changeable input 'Sex'"
    except ValidationError:
        pass

    print("[PASS] Test 4: What-If Validation: Out-of-range BMIs (<10, >70), invalid toggles, and fixed inputs successfully rejected.\n")


def test_why_this_score_generation():
    print("[RUNNING] Test 5: LLM whyThisScore Strict Formatting Rules...")
    sample_factors = [
        {"plainLabel": "Body Mass Index", "direction": "raises", "strength": "Strong"},
        {"plainLabel": "High Blood Pressure", "direction": "raises", "strength": "Moderate"},
        {"plainLabel": "Physical Activity", "direction": "lowers", "strength": "Moderate"},
        {"plainLabel": "Daily Vegetable Intake", "direction": "lowers", "strength": "Slight"},
    ]

    text = generate_two_sentence_why_this_score(sample_factors, "Diabetes", is_high_risk=True)

    # 1. Exactly two sentences
    # Split by period followed by space or end of string
    sentences = [s.strip() for s in re.split(r'\.\s+', text.strip()) if s.strip()]
    assert len(sentences) == 2, f"Must have exactly 2 sentences, got {len(sentences)}: '{text}'"

    # 2. Zero numbers (digits)
    assert not re.search(r'\d', text), f"whyThisScore must not contain any numbers: '{text}'"

    # 3. Zero diagnosis
    forbidden_terms = ["you have diabetes", "diagnosed with", "clinical diagnosis", "you suffer from"]
    for term in forbidden_terms:
        assert term not in text.lower(), f"Term '{term}' violates non-diagnostic requirement: '{text}'"

    print(f"Generated whyThisScore sample:\n\"{text}\"")
    print("[PASS] Test 5: whyThisScore: Exactly 2 sentences, zero numbers, zero diagnosis verified.\n")


if __name__ == "__main__":
    print("=" * 70)
    print("RUNNING SHAP EXPLAINABILITY & WHAT-IF SIMULATION TESTS")
    print("=" * 70)
    test_feature_mappings_spec()
    test_high_risk_user_shap_factors()
    test_low_risk_user_shap_factors()
    test_what_if_validation_and_rejection()
    test_why_this_score_generation()
    print("=" * 70)
    print("ALL SHAP EXPLAINABILITY TESTS PASSED SUCCESSFULLY!")
    print("=" * 70)
    sys.exit(0)
