import sys
import os
import io
from unittest.mock import AsyncMock, MagicMock
from bson import ObjectId

# Ensure backend directory is in sys.path
sys.path.insert(0, os.path.abspath('.'))
sys.path.insert(0, os.path.abspath('backend'))

# Mock connect_to_mongo BEFORE app.main imports it to avoid offline network timeout
import app.db.mongodb
app.db.mongodb.connect_to_mongo = AsyncMock()
app.db.mongodb.close_mongo_connection = AsyncMock()


from app.features.labs.service import (
    scrub_pii,
    extract_biomarkers_from_text,
    evaluate_clinical_findings,
    derive_model_inputs_from_labs
)
from app.features.labs.schemas import BiomarkerConfirmationPayload


def test_pii_scrubbing():
    text = (
        "Patient Name: John Doe\n"
        "DOB: 05/12/1980\n"
        "SSN: 123-45-6789\n"
        "Phone: (555) 123-4567\n"
        "MRN: 98765432\n"
        "Total Cholesterol: 215 mg/dL\n"
        "Fasting Glucose: 104 mg/dL\n"
    )
    scrubbed = scrub_pii(text)
    assert "John Doe" not in scrubbed
    assert "123-45-6789" not in scrubbed
    assert "(555) 123-4567" not in scrubbed
    assert "Total Cholesterol: 215 mg/dL" in scrubbed
    assert "Fasting Glucose: 104 mg/dL" in scrubbed
    print("[PASS] test_pii_scrubbing")


def test_biomarker_extraction_and_unit_conversion():
    lab_text = """
    QUEST DIAGNOSTICS CLINICAL REPORT
    Patient: Confidential
    Collection Date: 2026-10-15
    
    LIPID PANEL:
    Total Cholesterol: 232 mg/dL       (Desirable: <200)
    HDL Cholesterol: 42 mg/dL         (Normal: >40)
    LDL Cholesterol: 148 mg/dL        (Optimal: <100)
    Triglycerides: 185 mg/dL          (Normal: <150)
    
    METABOLIC:
    Fasting Blood Glucose: 112 mg/dL  (Reference: 70-99)
    Hemoglobin A1c: 6.1 %             (Normal: <5.7)
    
    VITALS:
    Blood Pressure: 134/86 mmHg
    """
    detected = extract_biomarkers_from_text(lab_text)
    assert "total_cholesterol" in detected
    assert detected["total_cholesterol"].value == 232.0

    assert "hdl_cholesterol" in detected
    assert detected["hdl_cholesterol"].value == 42.0

    assert "ldl_cholesterol" in detected
    assert detected["ldl_cholesterol"].value == 148.0

    assert "triglycerides" in detected
    assert detected["triglycerides"].value == 185.0

    assert "fasting_glucose" in detected
    assert detected["fasting_glucose"].value == 112.0

    assert "hba1c" in detected
    assert detected["hba1c"].value == 6.1

    assert "bp_systolic" in detected
    assert detected["bp_systolic"].value == 134.0
    assert detected["bp_diastolic"].value == 86.0
    print("[PASS] test_biomarker_extraction_and_unit_conversion")


def test_clinical_interpretation_rules():
    payload = BiomarkerConfirmationPayload(
        bp_systolic=134.0,
        bp_diastolic=86.0,
        total_cholesterol=232.0,
        ldl_cholesterol=148.0,
        hdl_cholesterol=42.0,
        triglycerides=185.0,
        fasting_glucose=112.0,
        hba1c=6.1
    )
    report = evaluate_clinical_findings(payload)
    assert report.total_markers_evaluated >= 7
    assert report.summary_status in ["borderline", "elevated"]

    findings_map = {f.canonical_key: f for f in report.findings}

    # Total cholesterol 232 is borderline (200-239)
    assert findings_map["total_cholesterol"].status == "borderline"

    # Fasting glucose 112 is borderline prediabetes (100-125)
    assert findings_map["fasting_glucose"].status == "borderline"

    # HbA1c 6.1 is borderline prediabetes (5.7 - 6.4)
    assert findings_map["hba1c"].status == "borderline"

    # BP 134/86 is Stage 1 hypertension (130-139 / 80-89)
    assert findings_map["blood_pressure"].status == "borderline"

    # Model input mapping: all 3 heart measurements present -> high confidence tier
    assert report.model_inputs.confidence_tier == "high"
    assert len(report.model_inputs.imputed_fields) == 0
    assert report.model_inputs.heart_disease["trestbps"] == 134.0
    assert report.model_inputs.heart_disease["chol"] == 232.0
    assert report.model_inputs.heart_disease["fbs"] == 0.0  # fasting glucose 112 <= 120 and a1c 6.1 < 6.5
    print("[PASS] test_clinical_interpretation_rules")


def test_tiered_confidence_scenarios():
    # Scenario A: Full lab confirmed -> High
    payload_full = BiomarkerConfirmationPayload(
        bp_systolic=125.0,
        total_cholesterol=195.0,
        fasting_glucose=95.0
    )
    mapping_full = derive_model_inputs_from_labs(payload_full)
    assert mapping_full.confidence_tier == "high"
    assert len(mapping_full.imputed_fields) == 0

    # Scenario B: Partial lab (BP known, cholesterol missing) -> Partial
    payload_partial = BiomarkerConfirmationPayload(
        bp_systolic=130.0
    )
    mapping_partial = derive_model_inputs_from_labs(payload_partial)
    assert mapping_partial.confidence_tier == "partial"
    assert "chol" in mapping_partial.imputed_fields

    # Scenario C: Screening only (no clinical measurements) -> Screening
    payload_screening = BiomarkerConfirmationPayload()
    mapping_screening = derive_model_inputs_from_labs(payload_screening)
    assert mapping_screening.confidence_tier == "screening"
    assert set(mapping_screening.imputed_fields) == {"trestbps", "chol", "fbs"}
    print("[PASS] test_tiered_confidence_scenarios")


def test_api_integration():
    from app.ml.loader import ml_loader
    from app.features.labs.service import evaluate_clinical_findings
    from app.ml.service import process_prediction, compute_health_score
    from app.features.predictions.schemas import HealthIntakePayload

    ml_loader.load_artifacts()

    mock_user = {"id": "mock_user_123", "email": "labtest@example.com"}

    print("  - Testing clinical interpretation...", flush=True)
    interpret_payload = BiomarkerConfirmationPayload(
        bp_systolic=138,
        bp_diastolic=88,
        total_cholesterol=245,
        fasting_glucose=130,
        hba1c=6.8
    )
    report = evaluate_clinical_findings(interpret_payload)
    assert report.summary_status == "elevated"
    assert report.model_inputs.confidence_tier == "high"
    assert report.model_inputs.heart_disease["trestbps"] == 138.0
    assert report.model_inputs.heart_disease["chol"] == 245.0
    assert report.model_inputs.heart_disease["fbs"] == 1.0

    print("  - Testing health score calculation with lab values...", flush=True)
    pred_payload = HealthIntakePayload(
        Sex=1,
        Age=50,
        BMI=27.0,
        HighBP=1,
        HighChol=1,
        Smoker=0,
        PhysActivity=1,
        Fruits=1,
        Veggies=1,
        HvyAlcoholConsump=0,
        Stroke=0,
        HeartDiseaseorAttack=0,
        DiffWalk=0,
        GenHlth=3,
        MentHlth=2,
        PhysHlth=1,
        age=50,
        sex=1,
        cp=1,
        trestbps=138,
        chol=245,
        fbs=1,
        exang=0,
        confidenceTier="high"
    )
    full_dict = pred_payload.model_dump()
    health_score = compute_health_score(full_dict)
    assert "total_score" in health_score

    print("  - Testing process_prediction with tiered confidence...", flush=True)
    results = process_prediction(full_dict)
    assert results["heartDisease"]["status"] == "success"
    assert results["heartDisease"]["confidenceTier"] == "high"
    assert results["heartDisease"]["imputedFields"] == []
    print("[PASS] test_api_integration", flush=True)


if __name__ == "__main__":
    print("=" * 60)
    print("RUNNING LAB REPORT ANALYSIS & TIERED CONFIDENCE TESTS")
    print("=" * 60)
    test_pii_scrubbing()
    test_biomarker_extraction_and_unit_conversion()
    test_clinical_interpretation_rules()
    test_tiered_confidence_scenarios()
    test_api_integration()
    print("=" * 60)
    print("ALL LAB ANALYSIS TESTS PASSED!")
    print("=" * 60)
