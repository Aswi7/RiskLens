import io
import re
import json
import base64
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple

import httpx
from pypdf import PdfReader

from app.core.config import settings
from app.features.labs.schemas import (
    ExtractedBiomarkerItem,
    LabExtractionResponse,
    BiomarkerConfirmationPayload,
    ClinicalFindingItem,
    LabFindingsReport,
    ModelInputMapping
)

logger = logging.getLogger("risklens.labs")

# PII Scrubbing regex patterns
PII_PATTERNS = [
    (r"\b\d{3}-\d{2}-\d{4}\b", "[REDACTED_SSN]"),  # SSN
    (r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b", "[REDACTED_EMAIL]"),
    (r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b", "[REDACTED_PHONE]"),
    (r"\b(?:MRN|Account|Patient ID|Ref No|Record #)[\s:]*([A-Za-z0-9-]+)\b", r"MRN: [REDACTED_ID]"),
    (r"(?:Patient Name|Name|Patient)[\s:]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)", "Patient Name: [REDACTED_NAME]"),
    (r"(?:DOB|Birth Date|Date of Birth)[\s:]+([0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4})", "DOB: [REDACTED_DOB]"),
    (r"(?:Address)[\s:]+([^\n\r]+)", "Address: [REDACTED_ADDRESS]"),
]


def scrub_pii(text: str) -> str:
    """Scrubs patient identifying information (Names, SSN, MRN, Phone, Email, Address)."""
    if not text:
        return ""
    sanitized = text
    for pattern, replacement in PII_PATTERNS:
        sanitized = re.sub(pattern, replacement, sanitized, flags=re.IGNORECASE)
    return sanitized


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extracts raw text layer from digital PDF in-memory using pypdf."""
    text_parts = []
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        for page_idx, page in enumerate(reader.pages):
            page_text = page.extract_text() or ""
            if page_text.strip():
                text_parts.append(page_text)
    except Exception as e:
        logger.warning(f"Failed to extract text from PDF via pypdf: {e}")
    return "\n\n".join(text_parts)


# Biomarker Aliases & Detection Specifications
BIOMARKER_SPECS = [
    {
        "canonical_key": "total_cholesterol",
        "name": "Total Cholesterol",
        "unit": "mg/dL",
        "aliases": [
            r"total\s+cholesterol",
            r"cholesterol[,\s]+total",
            r"serum\s+cholesterol",
            r"cholesterol\s+serum",
            r"\bchol\b",
            r"total\s+chol"
        ],
        "default_range": "< 200 mg/dL",
        "min_valid": 40.0,
        "max_valid": 700.0,
        "is_cholesterol": True
    },
    {
        "canonical_key": "ldl_cholesterol",
        "name": "LDL Cholesterol",
        "unit": "mg/dL",
        "aliases": [
            r"ldl\s+cholesterol",
            r"ldl-c\b",
            r"cholesterol[,\s]+ldl",
            r"ldl\s+calculated",
            r"direct\s+ldl",
            r"\bldl\b"
        ],
        "default_range": "< 100 mg/dL",
        "min_valid": 20.0,
        "max_valid": 500.0,
        "is_cholesterol": True
    },
    {
        "canonical_key": "hdl_cholesterol",
        "name": "HDL Cholesterol",
        "unit": "mg/dL",
        "aliases": [
            r"hdl\s+cholesterol",
            r"hdl-c\b",
            r"cholesterol[,\s]+hdl",
            r"direct\s+hdl",
            r"\bhdl\b"
        ],
        "default_range": ">= 50 mg/dL",
        "min_valid": 10.0,
        "max_valid": 200.0,
        "is_cholesterol": True
    },
    {
        "canonical_key": "triglycerides",
        "name": "Triglycerides",
        "unit": "mg/dL",
        "aliases": [
            r"triglycerides?",
            r"\btrig\b",
            r"serum\s+triglycerides?"
        ],
        "default_range": "< 150 mg/dL",
        "min_valid": 20.0,
        "max_valid": 2000.0,
        "is_cholesterol": False
    },
    {
        "canonical_key": "fasting_glucose",
        "name": "Fasting Blood Glucose",
        "unit": "mg/dL",
        "aliases": [
            r"fasting\s+(?:blood\s+)?glucose",
            r"glucose[,\s]+fasting",
            r"\bfbs\b",
            r"\bfbg\b",
            r"fasting\s+plasma\s+glucose"
        ],
        "default_range": "70 - 99 mg/dL",
        "min_valid": 30.0,
        "max_valid": 600.0,
        "is_glucose": True
    },
    {
        "canonical_key": "random_glucose",
        "name": "Blood Glucose",
        "unit": "mg/dL",
        "aliases": [
            r"glucose[,\s]+serum",
            r"plasma\s+glucose",
            r"blood\s+glucose",
            r"blood\s+sugar",
            r"\brbs\b",
            r"\bglucose\b"
        ],
        "default_range": "70 - 139 mg/dL",
        "min_valid": 30.0,
        "max_valid": 600.0,
        "is_glucose": True
    },
    {
        "canonical_key": "hba1c",
        "name": "Hemoglobin A1c (HbA1c)",
        "unit": "%",
        "aliases": [
            r"hemoglobin\s+a1c",
            r"glycated\s+hemoglobin",
            r"glycohemoglobin",
            r"\bhba1c\b",
            r"\ba1c\b"
        ],
        "default_range": "< 5.7 %",
        "min_valid": 3.5,
        "max_valid": 20.0,
        "is_a1c": True
    }
]


def extract_blood_pressure_from_text(text: str) -> Tuple[Optional[float], Optional[float]]:
    """Extracts systolic and diastolic blood pressure pairs like 120/80 mmHg."""
    # Look for patterns like "120/80", "120 / 80 mmHg", "BP: 130/85"
    bp_match = re.search(r"(?:BP|Blood\s+Pressure)?[^\w\n\r]*(\d{2,3})\s*[/]\s*(\d{2,3})\s*(?:mm\s*hg)?", text, re.IGNORECASE)
    if bp_match:
        sys_val = float(bp_match.group(1))
        dia_val = float(bp_match.group(2))
        if 60 <= sys_val <= 260 and 40 <= dia_val <= 160:
            return sys_val, dia_val
    return None, None


def extract_biomarkers_from_text(raw_text: str) -> Dict[str, ExtractedBiomarkerItem]:
    """
    High-precision regex parser for clinical lab reports.
    Extracts markers, detects units, auto-converts mmol/L to mg/dL, and extracts reference intervals.
    """
    clean_text = scrub_pii(raw_text)
    detected: Dict[str, ExtractedBiomarkerItem] = {}

    # 1. First look for Blood Pressure pair
    sys_val, dia_val = extract_blood_pressure_from_text(clean_text)
    if sys_val is not None:
        detected["bp_systolic"] = ExtractedBiomarkerItem(
            name="Systolic Blood Pressure",
            canonical_key="bp_systolic",
            value=sys_val,
            unit="mmHg",
            reference_range="< 120 mmHg",
            confidence="high",
            source_snippet=f"{int(sys_val)}/{int(dia_val)} mmHg"
        )
        detected["bp_diastolic"] = ExtractedBiomarkerItem(
            name="Diastolic Blood Pressure",
            canonical_key="bp_diastolic",
            value=dia_val,
            unit="mmHg",
            reference_range="< 80 mmHg",
            confidence="high",
            source_snippet=f"{int(sys_val)}/{int(dia_val)} mmHg"
        )

    lines = clean_text.splitlines()

    for spec in BIOMARKER_SPECS:
        key = spec["canonical_key"]
        if key in detected:
            continue

        for alias in spec["aliases"]:
            pattern = rf"(?:{alias})[^\w\n\r]*[:\t -]*([0-9]+(?:\.[0-9]+)?)\s*(mg/dl|mmol/l|%|g/dl|mg/l)?"
            found = False

            for line in lines:
                match = re.search(pattern, line, re.IGNORECASE)
                if match:
                    val_str = match.group(1)
                    unit_str = match.group(2) or spec["unit"]
                    val = float(val_str)

                    # Check for mmol/L unit conversion:
                    # 1 mmol/L of cholesterol = 38.67 mg/dL
                    # 1 mmol/L of glucose = 18.0182 mg/dL
                    is_mmol = "mmol" in unit_str.lower() or (val < 15.0 and spec.get("is_cholesterol"))
                    if is_mmol and spec.get("is_cholesterol"):
                        val = round(val * 38.67, 1)
                        unit_str = "mg/dL"
                    elif is_mmol and spec.get("is_glucose"):
                        val = round(val * 18.0182, 1)
                        unit_str = "mg/dL"

                    # Range validation sanity check
                    if spec["min_valid"] <= val <= spec["max_valid"]:
                        detected[key] = ExtractedBiomarkerItem(
                            name=spec["name"],
                            canonical_key=key,
                            value=val,
                            unit=unit_str,
                            reference_range=spec["default_range"],
                            confidence="high",
                            source_snippet=line.strip()[:100]
                        )
                        found = True
                        break
            if found:
                break

    # If fasting glucose was not detected, but random glucose was, use that as glucose indicator
    if "fasting_glucose" not in detected and "random_glucose" in detected:
        g = detected["random_glucose"]
        detected["fasting_glucose"] = ExtractedBiomarkerItem(
            name="Fasting Blood Glucose",
            canonical_key="fasting_glucose",
            value=g.value,
            unit=g.unit,
            reference_range="70 - 99 mg/dL",
            confidence="medium",
            source_snippet=f"{g.source_snippet} (Inferred from general glucose)"
        )

    return detected


async def extract_via_vision_llm(image_bytes: bytes, mime_type: str) -> Dict[str, ExtractedBiomarkerItem]:
    """
    Uses Gemini Vision or OpenAI Vision when digital PDF text extraction is not feasible (e.g. photos, scans).
    Returns structured JSON of extracted biomarkers.
    """
    detected: Dict[str, ExtractedBiomarkerItem] = {}
    gemini_key = settings.GEMINI_API_KEY or settings.GOOGLE_API_KEY
    openai_key = settings.OPENAI_API_KEY

    prompt_instruction = """Extract clinical lab values from this medical lab report image.
Return valid JSON ONLY matching this schema:
{
  "bp_systolic": number or null,
  "bp_diastolic": number or null,
  "total_cholesterol": number (in mg/dL) or null,
  "ldl_cholesterol": number (in mg/dL) or null,
  "hdl_cholesterol": number (in mg/dL) or null,
  "triglycerides": number (in mg/dL) or null,
  "fasting_glucose": number (in mg/dL) or null,
  "random_glucose": number (in mg/dL) or null,
  "hba1c": number (in %) or null
}
If values are in mmol/L, convert them to mg/dL before returning.
Never output markdown backticks or commentary, only raw JSON.
"""

    # 1. Gemini Vision API
    if gemini_key:
        try:
            b64_img = base64.b64encode(image_bytes).decode("utf-8")
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={gemini_key}"
            payload = {
                "contents": [
                    {
                        "parts": [
                            {"text": prompt_instruction},
                            {
                                "inline_data": {
                                    "mime_type": mime_type if mime_type.startswith("image/") else "image/png",
                                    "data": b64_img
                                }
                            }
                        ]
                    }
                ],
                "generationConfig": {
                    "temperature": 0.1,
                    "response_mime_type": "application/json"
                }
            }
            async with httpx.AsyncClient(timeout=25.0) as client:
                res = await client.post(url, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    raw_text = data["candidates"][0]["content"]["parts"][0]["text"]
                    parsed = json.loads(raw_text)
                    for k, v in parsed.items():
                        if v is not None and isinstance(v, (int, float)):
                            detected[k] = ExtractedBiomarkerItem(
                                name=k.replace("_", " ").title(),
                                canonical_key=k,
                                value=float(v),
                                unit="%" if k == "hba1c" else "mmHg" if "bp_" in k else "mg/dL",
                                confidence="high",
                                source_snippet="Extracted via Gemini Vision OCR"
                            )
                    return detected
        except Exception as e:
            logger.warning(f"Gemini Vision extraction failed: {e}")

    # 2. OpenAI Vision API
    elif openai_key:
        try:
            b64_img = base64.b64encode(image_bytes).decode("utf-8")
            url = "https://api.openai.com/v1/chat/completions"
            headers = {"Authorization": f"Bearer {openai_key}"}
            payload = {
                "model": "gpt-4o-mini",
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt_instruction},
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:{mime_type};base64,{b64_img}"}
                            }
                        ]
                    }
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0.1
            }
            async with httpx.AsyncClient(timeout=25.0) as client:
                res = await client.post(url, json=payload, headers=headers)
                if res.status_code == 200:
                    data = res.json()
                    parsed = json.loads(data["choices"][0]["message"]["content"])
                    for k, v in parsed.items():
                        if v is not None and isinstance(v, (int, float)):
                            detected[k] = ExtractedBiomarkerItem(
                                name=k.replace("_", " ").title(),
                                canonical_key=k,
                                value=float(v),
                                unit="%" if k == "hba1c" else "mmHg" if "bp_" in k else "mg/dL",
                                confidence="high",
                                source_snippet="Extracted via OpenAI Vision OCR"
                            )
                    return detected
        except Exception as e:
            logger.warning(f"OpenAI Vision extraction failed: {e}")

    return detected


async def parse_lab_file(file_bytes: bytes, filename: str, content_type: str) -> LabExtractionResponse:
    """
    Processes an uploaded lab document in-memory (zero-disk persistence).
    Attempts PDF digital layer text extraction first; falls back to Vision LLM for images/scans.
    """
    detected_markers: Dict[str, ExtractedBiomarkerItem] = {}
    is_pdf = filename.lower().endswith(".pdf") or "pdf" in content_type.lower()

    if is_pdf:
        pdf_text = extract_text_from_pdf(file_bytes)
        if len(pdf_text.strip()) > 30:
            detected_markers = extract_biomarkers_from_text(pdf_text)

    # If digital PDF had no text (scanned image) or if uploaded file is an image:
    if not detected_markers and (not is_pdf or len(detected_markers) == 0):
        mime = content_type if content_type else ("application/pdf" if is_pdf else "image/jpeg")
        detected_markers = await extract_via_vision_llm(file_bytes, mime)

    status = "success" if len(detected_markers) >= 2 else ("partial" if len(detected_markers) == 1 else "no_markers_found")
    message = (
        f"Successfully extracted {len(detected_markers)} clinical biomarker(s)."
        if len(detected_markers) > 0
        else "No recognized clinical lab biomarkers detected in the document. Please check the document or input values manually."
    )

    return LabExtractionResponse(
        filename=filename,
        file_type="PDF" if is_pdf else "Image",
        detected_markers=detected_markers,
        phi_redacted=True,
        status=status,
        message=message
    )


# ==============================================================================
# CLINICAL INTERPRETATION RULE ENGINE (AHA / ACC / ADA / NCEP ATP III)
# ==============================================================================
def evaluate_clinical_findings(payload: BiomarkerConfirmationPayload) -> LabFindingsReport:
    """
    Evaluates confirmed lab biomarker measurements using evidence-based clinical practice guidelines.
    Returns structured clinical findings, severity ratings, and model input feature mappings.
    """
    findings: List[ClinicalFindingItem] = []
    max_severity = 1

    # 1. Total Cholesterol (NCEP ATP III / AHA)
    if payload.total_cholesterol is not None:
        val = payload.total_cholesterol
        if val < 200:
            status = "optimal"
            sev = 1
            rec = "Maintain heart-healthy Mediterranean or DASH dietary pattern and regular cardiovascular exercise."
            note = f"Total cholesterol of {val} mg/dL is within the desirable, optimal cardiovascular range (<200 mg/dL)."
        elif 200 <= val < 240:
            status = "borderline"
            sev = 2
            rec = "Consider reducing saturated and trans-fat intake, increasing soluble fiber, and retesting in 6 months."
            note = f"Total cholesterol of {val} mg/dL is borderline elevated (200-239 mg/dL), representing mild atherogenic risk."
        else:
            status = "elevated"
            sev = 3
            rec = "Consult your physician for a comprehensive fasting lipid panel and cardiovascular risk assessment."
            note = f"Total cholesterol of {val} mg/dL is high (≥240 mg/dL), associated with increased risk of coronary artery disease."
        max_severity = max(max_severity, sev)
        findings.append(ClinicalFindingItem(
            biomarker="Total Cholesterol",
            canonical_key="total_cholesterol",
            value=val,
            unit="mg/dL",
            status=status,
            severity_level=sev,
            reference_range="< 200 mg/dL",
            clinical_finding=note,
            recommendation=rec
        ))

    # 2. LDL Cholesterol (AHA/ACC)
    if payload.ldl_cholesterol is not None:
        val = payload.ldl_cholesterol
        if val < 100:
            status, sev = "optimal", 1
            note = f"LDL cholesterol of {val} mg/dL is optimal (<100 mg/dL)."
            rec = "Continue cardioprotective lifestyle habits."
        elif 100 <= val < 130:
            status, sev = "normal", 1
            note = f"LDL cholesterol of {val} mg/dL is near optimal (100-129 mg/dL)."
            rec = "Maintain physical activity and balanced nutritional choices."
        elif 130 <= val < 160:
            status, sev = "borderline", 2
            note = f"LDL cholesterol of {val} mg/dL is borderline high (130-159 mg/dL)."
            rec = "Prioritize whole grains, leafy greens, and plant sterols to curb LDL oxidation."
        elif 160 <= val < 190:
            status, sev = "elevated", 3
            note = f"LDL cholesterol of {val} mg/dL is high (160-189 mg/dL), elevating atherosclerotic plaque vulnerability."
            rec = "Discuss clinical lipid-lowering strategies and cardiovascular risk factors with your doctor."
        else:
            status, sev = "critical", 4
            note = f"LDL cholesterol of {val} mg/dL is very high (≥190 mg/dL), a key clinical indicator for ASCVD."
            rec = "Prompt medical evaluation recommended by American College of Cardiology guidelines."
        max_severity = max(max_severity, sev)
        findings.append(ClinicalFindingItem(
            biomarker="LDL Cholesterol (Calculated/Direct)",
            canonical_key="ldl_cholesterol",
            value=val,
            unit="mg/dL",
            status=status,
            severity_level=sev,
            reference_range="< 100 mg/dL",
            clinical_finding=note,
            recommendation=rec
        ))

    # 3. HDL Cholesterol (Cardioprotective Marker)
    if payload.hdl_cholesterol is not None:
        val = payload.hdl_cholesterol
        if val >= 60:
            status, sev = "optimal", 1
            note = f"HDL cholesterol of {val} mg/dL is optimal and cardioprotective (≥60 mg/dL)."
            rec = "Protective HDL levels assist in reverse cholesterol transport from peripheral tissues."
        elif 40 <= val < 60:
            status, sev = "normal", 1
            note = f"HDL cholesterol of {val} mg/dL is within acceptable reference range (40-59 mg/dL)."
            rec = "Aerobic exercise, healthy fats (olive oil, nuts), and smoking avoidance help preserve HDL."
        else:
            status, sev = "elevated", 3  # High risk indicator
            note = f"HDL cholesterol of {val} mg/dL is low (<40 mg/dL), which constitutes an independent cardiovascular risk factor."
            rec = "Engage in regular moderate-to-vigorous aerobic exercise and minimize refined carbohydrate intake."
        max_severity = max(max_severity, sev)
        findings.append(ClinicalFindingItem(
            biomarker="HDL Cholesterol",
            canonical_key="hdl_cholesterol",
            value=val,
            unit="mg/dL",
            status=status,
            severity_level=sev,
            reference_range="≥ 50 mg/dL",
            clinical_finding=note,
            recommendation=rec
        ))

    # 4. Triglycerides (AHA Guidelines)
    if payload.triglycerides is not None:
        val = payload.triglycerides
        if val < 150:
            status, sev = "optimal", 1
            note = f"Triglycerides level of {val} mg/dL is normal (<150 mg/dL)."
            rec = "Maintain healthy weight and moderate carbohydrate intake."
        elif 150 <= val < 200:
            status, sev = "borderline", 2
            note = f"Triglycerides of {val} mg/dL are borderline elevated (150-199 mg/dL)."
            rec = "Reduce added sugars, refined starches, and alcohol consumption."
        elif 200 <= val < 500:
            status, sev = "elevated", 3
            note = f"Triglycerides of {val} mg/dL are high (200-499 mg/dL)."
            rec = "Physician consultation recommended to assess metabolic syndrome and cardiovascular risk."
        else:
            status, sev = "critical", 4
            note = f"Triglycerides of {val} mg/dL are very high (≥500 mg/dL), carrying risk of acute pancreatitis."
            rec = "Immediate medical evaluation recommended."
        max_severity = max(max_severity, sev)
        findings.append(ClinicalFindingItem(
            biomarker="Triglycerides",
            canonical_key="triglycerides",
            value=val,
            unit="mg/dL",
            status=status,
            severity_level=sev,
            reference_range="< 150 mg/dL",
            clinical_finding=note,
            recommendation=rec
        ))

    # 5. Triglyceride / HDL Ratio (Cardiovascular Atherogenicity & Insulin Resistance Marker)
    if payload.triglycerides is not None and payload.hdl_cholesterol is not None and payload.hdl_cholesterol > 0:
        ratio = round(payload.triglycerides / payload.hdl_cholesterol, 2)
        if ratio < 2.0:
            status, sev = "optimal", 1
            note = f"Triglyceride/HDL ratio of {ratio} is favorable (<2.0), suggesting low small dense LDL particles."
            rec = "Keep up current diet and exercise routine."
        elif 2.0 <= ratio < 3.5:
            status, sev = "normal", 1
            note = f"Triglyceride/HDL ratio of {ratio} is moderate."
            rec = "Maintain consistent weekly aerobic physical activity."
        else:
            status, sev = "elevated", 3
            note = f"Triglyceride/HDL ratio of {ratio} is elevated (≥3.5), strongly correlated with insulin resistance and atherogenic dyslipidemia."
            rec = "Discuss metabolic syndrome screening and dietary carbohydrate refinement with a clinician."
        max_severity = max(max_severity, sev)
        findings.append(ClinicalFindingItem(
            biomarker="Triglyceride-to-HDL Ratio",
            canonical_key="trig_hdl_ratio",
            value=ratio,
            unit="ratio",
            status=status,
            severity_level=sev,
            reference_range="< 2.5",
            clinical_finding=note,
            recommendation=rec
        ))

    # 6. Fasting Blood Glucose (ADA Standards of Care)
    if payload.fasting_glucose is not None:
        val = payload.fasting_glucose
        if val < 100:
            status, sev = "optimal", 1
            note = f"Fasting blood glucose of {val} mg/dL is in the normal healthy range (70-99 mg/dL)."
            rec = "Maintain balanced low-glycemic dietary choices."
        elif 100 <= val < 126:
            status, sev = "borderline", 2
            note = f"Fasting glucose of {val} mg/dL falls into the Impaired Fasting Glucose / Prediabetes category (100-125 mg/dL)."
            rec = "Structured lifestyle interventions (150 mins/week exercise, 5-7% weight reduction) can prevent progression to type 2 diabetes."
        else:
            status, sev = "elevated", 3
            note = f"Fasting glucose of {val} mg/dL is above the clinical diabetes diagnostic threshold (≥126 mg/dL)."
            rec = "Formal diagnostic confirmation with an HbA1c test and physician consultation is advised."
        max_severity = max(max_severity, sev)
        findings.append(ClinicalFindingItem(
            biomarker="Fasting Blood Glucose",
            canonical_key="fasting_glucose",
            value=val,
            unit="mg/dL",
            status=status,
            severity_level=sev,
            reference_range="70 - 99 mg/dL",
            clinical_finding=note,
            recommendation=rec
        ))

    # 7. Hemoglobin A1c (HbA1c)
    if payload.hba1c is not None:
        val = payload.hba1c
        if val < 5.7:
            status, sev = "optimal", 1
            note = f"HbA1c of {val}% reflects normal 3-month average blood glucose regulation (<5.7%)."
            rec = "Continue healthy balanced nutrition."
        elif 5.7 <= val < 6.5:
            status, sev = "borderline", 2
            note = f"HbA1c of {val}% falls within the prediabetes range (5.7% - 6.4%)."
            rec = "Focus on glycemic control, whole foods, strength training, and periodic 6-month retesting."
        else:
            status, sev = "elevated", 3
            note = f"HbA1c of {val}% meets or exceeds the type 2 diabetes clinical threshold (≥6.5%)."
            rec = "Schedule an appointment with an endocrinologist or primary care physician for diabetes management."
        max_severity = max(max_severity, sev)
        findings.append(ClinicalFindingItem(
            biomarker="Hemoglobin A1c (HbA1c)",
            canonical_key="hba1c",
            value=val,
            unit="%",
            status=status,
            severity_level=sev,
            reference_range="< 5.7 %",
            clinical_finding=note,
            recommendation=rec
        ))

    # 8. Blood Pressure (AHA/ACC 2017 Guidelines)
    if payload.bp_systolic is not None or payload.bp_diastolic is not None:
        sys_bp = payload.bp_systolic if payload.bp_systolic is not None else 120.0
        dia_bp = payload.bp_diastolic if payload.bp_diastolic is not None else 80.0

        if sys_bp > 180 or dia_bp > 120:
            status, sev = "critical", 4
            note = f"Blood pressure of {int(sys_bp)}/{int(dia_bp)} mmHg indicates a Hypertensive Urgency / Crisis (>180/>120 mmHg)."
            rec = "Immediate medical evaluation recommended if accompanied by chest pain, headache, or shortness of breath."
        elif sys_bp >= 140 or dia_bp >= 90:
            status, sev = "elevated", 3
            note = f"Blood pressure of {int(sys_bp)}/{int(dia_bp)} mmHg falls in Stage 2 Hypertension (≥140 or ≥90 mmHg)."
            rec = "Consult your physician regarding lifestyle modifications and potential antihypertensive therapy."
        elif (130 <= sys_bp < 140) or (80 <= dia_bp < 90):
            status, sev = "borderline", 2
            note = f"Blood pressure of {int(sys_bp)}/{int(dia_bp)} mmHg falls in Stage 1 Hypertension (130-139 or 80-89 mmHg)."
            rec = "Adopt the DASH diet, reduce sodium intake, and track home blood pressure readings."
        elif 120 <= sys_bp < 130 and dia_bp < 80:
            status, sev = "normal", 1
            note = f"Blood pressure of {int(sys_bp)}/{int(dia_bp)} mmHg is elevated (120-129/<80 mmHg)."
            rec = "Lifestyle modifications recommended to prevent progression to hypertension."
        else:
            status, sev = "optimal", 1
            note = f"Blood pressure of {int(sys_bp)}/{int(dia_bp)} mmHg is normal (<120/<80 mmHg)."
            rec = "Continue regular physical activity and stress management."

        max_severity = max(max_severity, sev)
        findings.append(ClinicalFindingItem(
            biomarker="Resting Blood Pressure",
            canonical_key="blood_pressure",
            value=sys_bp,
            unit="mmHg",
            status=status,
            severity_level=sev,
            reference_range="< 120/80 mmHg",
            clinical_finding=note,
            recommendation=rec
        ))

    # Derive Heart Model & Diabetes Model Inputs
    model_inputs = derive_model_inputs_from_labs(payload)

    summary_status = "optimal" if max_severity == 1 else ("borderline" if max_severity == 2 else ("elevated" if max_severity == 3 else "critical"))

    return LabFindingsReport(
        total_markers_evaluated=len(findings),
        summary_status=summary_status,
        findings=findings,
        model_inputs=model_inputs,
        timestamp=datetime.now(timezone.utc).isoformat()
    )


def derive_model_inputs_from_labs(payload: BiomarkerConfirmationPayload) -> ModelInputMapping:
    """
    Transforms confirmed lab biomarkers into parameters for the existing Heart Disease
    (Logistic Regression) and Diabetes (XGBoost) models, computing the Tiered Confidence rating.
    """
    # 1. Heart Disease parameters
    trestbps_val = payload.bp_systolic
    chol_val = payload.total_cholesterol
    fbs_glucose = payload.fasting_glucose or payload.random_glucose

    imputed_fields = []
    if trestbps_val is None:
        trestbps_val = 130.0  # Population median from heart_meta.json
        imputed_fields.append("trestbps")

    if chol_val is None:
        chol_val = 240.0  # Population median from heart_meta.json
        imputed_fields.append("chol")

    if fbs_glucose is None and payload.hba1c is None:
        fbs_val = 0.0  # Population median from heart_meta.json
        imputed_fields.append("fbs")
    else:
        is_elevated_sugar = (fbs_glucose is not None and fbs_glucose > 120) or (payload.hba1c is not None and payload.hba1c >= 6.5)
        fbs_val = 1.0 if is_elevated_sugar else 0.0

    # Determine Tiered Confidence:
    # Tier 1 ("high"): trestbps, chol, and fbs are all grounded in confirmed lab values
    # Tier 2 ("partial"): at least one of trestbps or chol is verified from lab
    # Tier 3 ("screening"): neither trestbps nor chol was available; all clinical metrics imputed
    if len(imputed_fields) == 0:
        confidence_tier = "high"
    elif "trestbps" not in imputed_fields or "chol" not in imputed_fields:
        confidence_tier = "partial"
    else:
        confidence_tier = "screening"

    heart_inputs = {
        "trestbps": float(trestbps_val),
        "chol": float(chol_val),
        "fbs": float(fbs_val),
        "confidence_tier": confidence_tier,
        "imputed_fields": imputed_fields
    }

    # 2. Diabetes Model Derived Parameters
    sys_bp = payload.bp_systolic
    dia_bp = payload.bp_diastolic
    high_bp = 1.0 if (sys_bp is not None and sys_bp >= 130) or (dia_bp is not None and dia_bp >= 80) else 0.0

    high_chol = 1.0 if (payload.total_cholesterol is not None and payload.total_cholesterol >= 200) or (payload.ldl_cholesterol is not None and payload.ldl_cholesterol >= 130) else 0.0

    diabetes_inputs = {
        "HighBP": high_bp,
        "HighChol": high_chol
    }

    return ModelInputMapping(
        heart_disease=heart_inputs,
        diabetes=diabetes_inputs,
        confidence_tier=confidence_tier,
        imputed_fields=imputed_fields
    )
