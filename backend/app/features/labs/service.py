import io
import os
import re
import json
import base64
import logging
import tempfile
import asyncio
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

import httpx
from pypdf import PdfReader
try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None

try:
    from PIL import Image, ImageOps, ImageFilter
except ImportError:
    Image = None
    ImageOps = None
    ImageFilter = None

try:
    import pytesseract
except ImportError:
    pytesseract = None

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

# Load configuration files once
CONFIG_DIR = Path(__file__).resolve().parent

with open(CONFIG_DIR / "analytes_config.json", "r", encoding="utf-8") as f:
    ANALYTES_CONFIG = json.load(f)["analytes"]

with open(CONFIG_DIR / "clinical_thresholds.json", "r", encoding="utf-8") as f:
    THRESHOLDS_CONFIG = json.load(f)["thresholds"]


# PII Scrubbing regex patterns (HIPAA 18 Identifiers)
PII_PATTERNS = [
    (r"\b\d{3}-\d{2}-\d{4}\b", "[REDACTED_SSN]"),  # SSN
    (r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b", "[REDACTED_EMAIL]"),
    (r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b", "[REDACTED_PHONE]"),
    (r"\b(?:MRN|Account|Patient ID|Ref No|Record #)[\s:]*([A-Za-z0-9-]+)\b", r"MRN: [REDACTED_ID]"),
    (r"(?:Patient Name|Patient Full Name|Patient|Client Name|Member Name)[\s:]+([^\n\r]+)", "Patient: [REDACTED_NAME]"),
    (r"(?:DOB|Birth Date|Date of Birth)[\s:]+([^\n\r]+)", "DOB: [REDACTED_DOB]"),
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


def verify_file_signature(file_bytes: bytes, filename: str) -> Tuple[bool, str, str]:
    """
    Validates file integrity using magic bytes signature, not just extension.
    Allowed formats: PDF (%PDF-), PNG (\x89PNG), JPG (\xff\xd8\xff).
    Returns (is_valid, mime_type, detected_format).
    """
    if not file_bytes or len(file_bytes) < 4:
        return False, "", "unknown"

    # PDF Magic bytes: %PDF- (0x25 0x50 0x44 0x46 0x2D)
    if file_bytes.startswith(b"%PDF-"):
        return True, "application/pdf", "PDF"

    # PNG Magic bytes: \x89PNG\r\n\x1a\n
    if file_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return True, "image/png", "PNG"

    # JPEG Magic bytes: \xff\xd8\xff
    if file_bytes.startswith(b"\xff\xd8\xff"):
        return True, "image/jpeg", "JPEG"

    return False, "", "unsupported"


def get_pdf_page_count(file_bytes: bytes) -> int:
    """Determines page count of a PDF using PyMuPDF or pypdf."""
    if fitz:
        try:
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            count = len(doc)
            doc.close()
            return count
        except Exception:
            pass
    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        return len(reader.pages)
    except Exception:
        return 1


def extract_text_layer_from_pdf(file_bytes: bytes) -> Tuple[str, int]:
    """
    Extracts text layer from digital PDF in-memory.
    Returns (extracted_text, page_count).
    """
    text_parts = []
    page_count = 1

    # 1. Try PyMuPDF (fitz)
    if fitz:
        try:
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            page_count = len(doc)
            for page in doc:
                t = page.get_text() or ""
                if t.strip():
                    text_parts.append(t)
            doc.close()
            if text_parts:
                return "\n\n".join(text_parts), page_count
        except Exception as e:
            logger.warning(f"PyMuPDF text extraction failed: {e}")

    # 2. Fallback to pypdf
    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        page_count = len(reader.pages)
        for page in reader.pages:
            t = page.extract_text() or ""
            if t.strip():
                text_parts.append(t)
    except Exception as e:
        logger.warning(f"pypdf text extraction failed: {e}")

    return "\n\n".join(text_parts), page_count


def preprocess_image_for_ocr(pil_img: Any) -> Any:
    """Preprocesses an image for OCR: grayscale, contrast enhancement, and thresholding."""
    if not Image or not pil_img:
        return pil_img
    try:
        # Convert to grayscale
        gray = pil_img.convert("L")
        # Enhance contrast
        gray = ImageOps.autocontrast(gray)
        # Apply slight sharpening
        sharpened = gray.filter(ImageFilter.SHARPEN)
        return sharpened
    except Exception as e:
        logger.warning(f"Image preprocessing warning: {e}")
        return pil_img


def ocr_rasterized_pdf(file_bytes: bytes) -> str:
    """
    Rasterises PDF pages and executes OCR using Tesseract when digital text layer is missing.
    """
    if not fitz or not pytesseract or not Image:
        return ""

    ocr_text_parts = []
    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        for page_idx, page in enumerate(doc):
            # Render page to an image pixmap at 200 DPI
            pix = page.get_pixmap(dpi=200)
            img = Image.open(io.BytesIO(pix.tobytes("png")))
            processed = preprocess_image_for_ocr(img)
            text = pytesseract.image_to_string(processed)
            if text.strip():
                ocr_text_parts.append(text)
        doc.close()
    except Exception as e:
        logger.warning(f"Tesseract PDF OCR execution encountered issue: {e}")

    return "\n\n".join(ocr_text_parts)


def ocr_image_file(file_bytes: bytes) -> str:
    """Executes OCR on an uploaded image file (PNG / JPG)."""
    if not pytesseract or not Image:
        return ""
    try:
        img = Image.open(io.BytesIO(file_bytes))
        processed = preprocess_image_for_ocr(img)
        text = pytesseract.image_to_string(processed)
        return text
    except Exception as e:
        logger.warning(f"Tesseract image OCR execution issue: {e}")
        return ""


def extract_blood_pressure(text: str) -> Tuple[Optional[float], Optional[float], Optional[str], str]:
    """
    Extracts blood pressure pair (systolic/diastolic) from text.
    Returns (sys, dia, snippet, confidence).
    """
    bp_match = re.search(r"(?:BP|Blood\s+Pressure)(?:\s*\([^)]*\))?[^\d\n\r]{0,30}?(\d{2,3})\s*[/]\s*(\d{2,3})\s*(?:mm\s*hg)?", text, re.IGNORECASE)
    if not bp_match:
        bp_match = re.search(r"\b(\d{2,3})\s*[/]\s*(\d{2,3})\s*(?:mm\s*hg)\b", text, re.IGNORECASE)
    if not bp_match:
        bp_match = re.search(r"(?:BP|Blood\s+Pressure)?[^\w\n\r]*(\d{2,3})\s*[/]\s*(\d{2,3})\s*(?:mm\s*hg)?", text, re.IGNORECASE)
    if bp_match:
        sys_val = float(bp_match.group(1))
        dia_val = float(bp_match.group(2))
        if 50 <= sys_val <= 280 and 30 <= dia_val <= 180:
            snippet = bp_match.group(0).strip()
            return sys_val, dia_val, snippet, "high"
    return None, None, None, "low"


def extract_biomarkers_rule_based(
    raw_text: str,
    source_confidence: str = "high"
) -> Tuple[Dict[str, ExtractedBiomarkerItem], bool]:
    """
    Extracts lab biomarkers according to analytes_config.json:
    - Analyte synonyms matching
    - Canonical unit normalisation (converting mmol/L, mmol/mol)
    - Plausible range validation
    - High/Low clinical flag detection
    - Glucose distinction: fasting vs random vs postprandial vs unknown

    Returns (detected_markers, unclear_glucose_flag).
    """
    clean_text = scrub_pii(raw_text)
    detected: Dict[str, ExtractedBiomarkerItem] = {}
    unclear_glucose = False

    # 1. Blood Pressure pair extraction
    sys_bp, dia_bp, bp_snippet, bp_conf = extract_blood_pressure(clean_text)
    if sys_bp is not None and dia_bp is not None:
        detected["bp_systolic"] = ExtractedBiomarkerItem(
            name="Systolic Blood Pressure",
            canonical_key="bp_systolic",
            value=sys_bp,
            unit="mmHg",
            reference_range="< 120 mmHg",
            confidence=source_confidence if source_confidence == "high" else "medium",
            source_snippet=bp_snippet
        )
        detected["bp_diastolic"] = ExtractedBiomarkerItem(
            name="Diastolic Blood Pressure",
            canonical_key="bp_diastolic",
            value=dia_bp,
            unit="mmHg",
            reference_range="< 80 mmHg",
            confidence=source_confidence if source_confidence == "high" else "medium",
            source_snippet=bp_snippet
        )

    lines = [l.strip() for l in clean_text.splitlines() if l.strip()]

    for spec in ANALYTES_CONFIG:
        key = spec["canonical_key"]
        # Skip blood pressure individual searches if already extracted as pair
        if key in ("bp_systolic", "bp_diastolic") and key in detected:
            continue
        if key in detected:
            continue

        min_valid, max_valid = spec["plausible_range"]

        for syn in spec["synonyms"]:
            pattern = rf"(?:{syn})(?:\s*\([^)]*\))?[^\d\n\r]{{0,40}}?([0-9]+(?:\.[0-9]+)?)(?:\s*\|\s*|\s+)?(mg/dl|mmol/l|mmol/mol|%|g/dl|mg/l)?\s*([HL]|HIGH|LOW|ABNORMAL|\*|▲|▼)?"
            found = False

            for idx, line in enumerate(lines):
                val = None
                unit_str = spec["canonical_unit"]
                flag_str = None
                snippet = line

                # Check A: Same-line match
                match = re.search(pattern, line, re.IGNORECASE)
                if match:
                    val = float(match.group(1))
                    unit_str = (match.group(2) or spec["canonical_unit"]).strip()
                    flag_str = match.group(3).strip() if match.group(3) else None
                else:
                    # Check B: Multi-line table column layout (common in PDF lab reports)
                    # If this line has the analyte title, the value may be on the next 1-3 lines
                    if re.search(rf'^(?:[^\w\n\r]*)(?:{syn})', line, re.I) or re.search(rf'\b(?:{syn})\b', line, re.I):
                        # Skip reference range explanatory notes
                        if not re.search(r'\b(normal|impaired|suspicion|desirable|optimal|borderline|adjusted|ranges)\b', line, re.I):
                            for next_offset in range(1, 4):
                                if idx + next_offset < len(lines):
                                    next_line = lines[idx + next_offset]
                                    num_m = re.search(r'^([0-9]+(?:\.[0-9]+)?)\b', next_line)
                                    if num_m:
                                        val = float(num_m.group(1))
                                        snippet = f"{line} -> {next_line}"
                                        # Look for unit and flag on next_line and following lines
                                        for look_ahead in range(next_offset, next_offset + 3):
                                            if idx + look_ahead < len(lines):
                                                ahead_line = lines[idx + look_ahead]
                                                u_m = re.search(r'\b(mg/dl|mmol/l|mmol/mol|%|g/dl|mg/l)\b', ahead_line, re.I)
                                                if u_m:
                                                    unit_str = u_m.group(1)
                                                f_m = re.search(r'\b(HIGH|LOW|NORMAL|ABNORMAL|[HL])\b', ahead_line, re.I)
                                                if f_m:
                                                    flag_str = f_m.group(1).upper()
                                        break

                if val is not None:
                    # --- UNIT CONVERSION LOGIC ---
                    unit_lower = unit_str.lower()
                    if "glucose" in key and "mmol" in unit_lower:
                        val = round(val * 18.0, 1)
                        unit_str = "mg/dL"
                    elif ("cholesterol" in key or key in ("total_cholesterol", "ldl_cholesterol", "hdl_cholesterol")) and "mmol" in unit_lower:
                        val = round(val * 38.67, 1)
                        unit_str = "mg/dL"
                    elif "triglycerides" in key and "mmol" in unit_lower:
                        val = round(val * 88.57, 1)
                        unit_str = "mg/dL"
                    elif key == "hba1c" and "mmol/mol" in unit_lower:
                        val = round(0.0915 * val + 2.15, 2)
                        unit_str = "%"

                    # Plausible Range Filter
                    if not (min_valid <= val <= max_valid):
                        continue

                    # Reference range extraction
                    ref_match = re.search(r"(?:Ref(?:erence)?|Normal|Desirable)[^\w\n\r]*[:\t ]*([<>=0-9 -]+(?:\.[0-9]+)?\s*(?:mg/dl|%|mmol/l)?)", line, re.IGNORECASE)
                    ref_range = ref_match.group(1).strip() if ref_match else None

                    item_conf = source_confidence
                    if key == "unknown_glucose":
                        item_conf = "low"
                        unclear_glucose = True

                    detected[key] = ExtractedBiomarkerItem(
                        name=spec["name"],
                        canonical_key=key,
                        value=val,
                        unit=unit_str,
                        reference_range=ref_range,
                        flag=flag_str,
                        confidence=item_conf,
                        source_snippet=snippet[:100],
                        glucose_type=spec.get("glucose_type")
                    )
                    found = True
                    break

            if found:
                break

    # Remove redundant unknown_glucose if a specific glucose type was already detected
    if ("fasting_glucose" in detected or "random_glucose" in detected or "postprandial_glucose" in detected) and "unknown_glucose" in detected:
        del detected["unknown_glucose"]

    # If unknown_glucose was detected, and neither fasting nor random was specifically identified:
    if "unknown_glucose" in detected and "fasting_glucose" not in detected and "random_glucose" not in detected:
        unclear_glucose = True

    return detected, unclear_glucose


def extract_via_llm_text(clean_text: str) -> Dict[str, ExtractedBiomarkerItem]:
    """
    Intelligent LLM-assisted lab extraction for text extracted from digital PDFs.
    Handles arbitrary table layouts, column structures, and doctor notes.
    Tries GEMINI_API_KEY, then automatically falls back to GOOGLE_API_KEY.
    """
    if not clean_text or len(clean_text.strip()) < 15:
        return {}

    gemini_keys = [k for k in [settings.GEMINI_API_KEY, settings.GOOGLE_API_KEY] if k]
    openai_key = settings.OPENAI_API_KEY

    prompt_instruction = f"""You are a clinical laboratory report parser.
Extract the clinical lab values from the following document text.
Return valid JSON ONLY matching this exact structure:
{{
  "fasting_glucose": number or null,
  "random_glucose": number or null,
  "postprandial_glucose": number or null,
  "hba1c": number or null,
  "total_cholesterol": number or null,
  "ldl_cholesterol": number or null,
  "hdl_cholesterol": number or null,
  "triglycerides": number or null,
  "bp_systolic": number or null,
  "bp_diastolic": number or null
}}

RULES:
- Standard units required: mg/dL for glucose and lipids, % for HbA1c, mmHg for BP.
- If reported in mmol/L, convert to mg/dL:
  * Glucose: multiply by 18.0
  * Cholesterol (Total, LDL, HDL): multiply by 38.67
  * Triglycerides: multiply by 88.57
- If a biomarker is not found in the text, return null.
- Output ONLY the JSON object.

DOCUMENT TEXT:
\"\"\"
{clean_text[:4000]}
\"\"\""""

    name_map = {
        "fasting_glucose": "Fasting Blood Glucose",
        "random_glucose": "Random Blood Glucose",
        "postprandial_glucose": "Post-Prandial Blood Glucose",
        "hba1c": "Hemoglobin A1c (HbA1c)",
        "total_cholesterol": "Total Cholesterol",
        "ldl_cholesterol": "LDL Cholesterol",
        "hdl_cholesterol": "HDL Cholesterol",
        "triglycerides": "Triglycerides",
        "bp_systolic": "Systolic Blood Pressure",
        "bp_diastolic": "Diastolic Blood Pressure"
    }

    for g_key in gemini_keys:
        try:
            url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent"
            headers = {"x-goog-api-key": g_key}
            payload = {
                "contents": [{"parts": [{"text": prompt_instruction}]}],
                "generationConfig": {"temperature": 0.0, "response_mime_type": "application/json"}
            }
            with httpx.Client(timeout=6.0) as client:
                res = client.post(url, json=payload, headers=headers)
                if res.status_code == 200:
                    data = res.json()
                    raw = data["candidates"][0]["content"]["parts"][0]["text"]
                    parsed = json.loads(raw)
                    results = {}
                    for k, v in parsed.items():
                        if v is not None and isinstance(v, (int, float)):
                            val_float = float(v)
                            unit = "%" if k == "hba1c" else ("mmHg" if "bp_" in k else "mg/dL")
                            results[k] = ExtractedBiomarkerItem(
                                name=name_map.get(k, k.replace("_", " ").title()),
                                canonical_key=k,
                                value=val_float,
                                unit=unit,
                                confidence="high",
                                source_snippet="Extracted via intelligent AI document parser"
                            )
                    if results:
                        return results
        except Exception as e:
            logger.warning(f"Gemini text extraction attempt failed with key ending in ...{g_key[-6:]}: {e}")

    # Fallback to OpenAI if configured
    if openai_key:
        try:
            url = "https://api.openai.com/v1/chat/completions"
            headers = {"Authorization": f"Bearer {openai_key}"}
            payload = {
                "model": "gpt-4o-mini",
                "temperature": 0.0,
                "response_format": {"type": "json_object"},
                "messages": [{"role": "user", "content": prompt_instruction}]
            }
            with httpx.Client(timeout=6.0) as client:
                res = client.post(url, json=payload, headers=headers)
                if res.status_code == 200:
                    raw = res.json()["choices"][0]["message"]["content"]
                    parsed = json.loads(raw)
                    results = {}
                    for k, v in parsed.items():
                        if v is not None and isinstance(v, (int, float)):
                            val_float = float(v)
                            unit = "%" if k == "hba1c" else ("mmHg" if "bp_" in k else "mg/dL")
                            results[k] = ExtractedBiomarkerItem(
                                name=name_map.get(k, k.replace("_", " ").title()),
                                canonical_key=k,
                                value=val_float,
                                unit=unit,
                                confidence="high",
                                source_snippet="Extracted via intelligent AI document parser"
                            )
                    if results:
                        return results
        except Exception as e:
            logger.warning(f"OpenAI text extraction failed: {e}")

    return {}


async def extract_via_vision_llm_grounded(
    image_bytes: bytes,
    mime_type: str,
    raw_ocr_text: str = ""
) -> Dict[str, ExtractedBiomarkerItem]:
    """
    Multimodal Vision LLM extraction for scanned PDFs, photos, and PNG/JPG images.
    Tries GEMINI_API_KEY, then automatically falls back to GOOGLE_API_KEY.
    """
    gemini_keys = [k for k in [settings.GEMINI_API_KEY, settings.GOOGLE_API_KEY] if k]
    openai_key = settings.OPENAI_API_KEY

    prompt_instruction = """Extract clinical lab values from this lab report image/document.
Return valid JSON ONLY matching this exact structure:
{
  "fasting_glucose": number or null,
  "random_glucose": number or null,
  "postprandial_glucose": number or null,
  "hba1c": number or null,
  "total_cholesterol": number or null,
  "ldl_cholesterol": number or null,
  "hdl_cholesterol": number or null,
  "triglycerides": number or null,
  "bp_systolic": number or null,
  "bp_diastolic": number or null
}
Ensure all values are in canonical units (mg/dL for lipids and glucose, % for HbA1c, mmHg for BP).
Output JSON only. Do not add explanations."""

    name_map = {
        "fasting_glucose": "Fasting Blood Glucose",
        "random_glucose": "Random Blood Glucose",
        "postprandial_glucose": "Post-Prandial Blood Glucose",
        "hba1c": "Hemoglobin A1c (HbA1c)",
        "total_cholesterol": "Total Cholesterol",
        "ldl_cholesterol": "LDL Cholesterol",
        "hdl_cholesterol": "HDL Cholesterol",
        "triglycerides": "Triglycerides",
        "bp_systolic": "Systolic Blood Pressure",
        "bp_diastolic": "Diastolic Blood Pressure"
    }

    try:
        b64_img = base64.b64encode(image_bytes).decode("utf-8")

        for g_key in gemini_keys:
            try:
                url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent"
                headers = {"x-goog-api-key": g_key}
                payload = {
                    "contents": [
                        {
                            "parts": [
                                {"text": prompt_instruction},
                                {"inline_data": {"mime_type": mime_type, "data": b64_img}}
                            ]
                        }
                    ],
                    "generationConfig": {"temperature": 0.0, "response_mime_type": "application/json"}
                }
                async with httpx.AsyncClient(timeout=8.0) as client:
                    res = await client.post(url, json=payload, headers=headers)
                    if res.status_code == 200:
                        text_out = res.json()["candidates"][0]["content"]["parts"][0]["text"]
                        parsed_json = json.loads(text_out)
                        results = {}
                        for k, v in parsed_json.items():
                            if v is not None and isinstance(v, (int, float)):
                                val_float = float(v)
                                unit = "%" if k == "hba1c" else ("mmHg" if "bp_" in k else "mg/dL")
                                results[k] = ExtractedBiomarkerItem(
                                    name=name_map.get(k, k.replace("_", " ").title()),
                                    canonical_key=k,
                                    value=val_float,
                                    unit=unit,
                                    confidence="medium",
                                    source_snippet="Extracted via AI Vision Pipeline"
                                )
                        if results:
                            return results
            except Exception as ge:
                logger.warning(f"Gemini Vision extraction failed with key ending in ...{g_key[-6:]}: {ge}")

        # Fallback to OpenAI Vision if configured
        if openai_key:
            try:
                url = "https://api.openai.com/v1/chat/completions"
                headers = {"Authorization": f"Bearer {openai_key}"}
                payload = {
                    "model": "gpt-4o-mini",
                    "temperature": 0.0,
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": prompt_instruction},
                                {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{b64_img}"}}
                            ]
                        }
                    ]
                }
                async with httpx.AsyncClient(timeout=8.0) as client:
                    res = await client.post(url, json=payload, headers=headers)
                    if res.status_code == 200:
                        text_out = res.json()["choices"][0]["message"]["content"]
                        parsed_json = json.loads(text_out)
                        results = {}
                        for k, v in parsed_json.items():
                            if v is not None and isinstance(v, (int, float)):
                                val_float = float(v)
                                unit = "%" if k == "hba1c" else ("mmHg" if "bp_" in k else "mg/dL")
                                results[k] = ExtractedBiomarkerItem(
                                    name=name_map.get(k, k.replace("_", " ").title()),
                                    canonical_key=k,
                                    value=val_float,
                                    unit=unit,
                                    confidence="medium",
                                    source_snippet="Extracted via AI Vision Pipeline"
                                )
                        if results:
                            return results
            except Exception as oe:
                logger.warning(f"OpenAI Vision extraction failed: {oe}")

    except Exception as e:
        logger.warning(f"Vision LLM extraction fallback encountered an error: {e}")

    return {}


def process_lab_document_in_memory(
    file_bytes: bytes,
    filename: str,
    mime_type: str,
    draft_id: str
) -> LabExtractionResponse:
    """
    Synchronous extraction pipeline designed to run in a worker thread (asyncio.to_thread).
    Multi-stage extraction:
    1. Digital text extraction (PDF / OCR)
    2. Rule-based regex extraction
    3. Intelligent AI text extraction (for digital PDFs with complex layouts)
    4. Multimodal AI Vision extraction (for scanned PDFs & images without OCR)
    """
    is_pdf = mime_type == "application/pdf"
    extracted_text = ""
    page_count = 1
    source_conf = "high"

    # Step 1: Text Acquisition
    if is_pdf:
        extracted_text, page_count = extract_text_layer_from_pdf(file_bytes)
        # If text layer is too short (< 30 characters), document is scanned/rasterized
        if len(extracted_text.strip()) < 30:
            logger.info("PDF text layer is empty or scanned; rasterising for OCR...")
            extracted_text = ocr_rasterized_pdf(file_bytes)
            source_conf = "medium"
    else:
        # Uploaded as Image (PNG/JPG)
        extracted_text = ocr_image_file(file_bytes)
        source_conf = "medium"

    # Step 2: Rule-Based Regex Extraction
    detected_markers, unclear_glucose = extract_biomarkers_rule_based(extracted_text, source_confidence=source_conf)

    # Step 3: AI Text Extraction (if rule-based found few or no markers but text exists)
    if len(detected_markers) < 2 and len(extracted_text.strip()) >= 15:
        logger.info("Rule-based extraction returned sparse results; using AI document parser...")
        ai_markers = extract_via_llm_text(extracted_text)
        for k, v in ai_markers.items():
            if k not in detected_markers:
                detected_markers[k] = v

    # Step 4: Multimodal AI Vision Fallback (for scanned PDFs or images where local OCR was unavailable)
    if not detected_markers:
        logger.info("No markers found via text/OCR; attempting Vision AI extraction...")
        loop = asyncio.new_event_loop()
        try:
            detected_markers = loop.run_until_complete(
                extract_via_vision_llm_grounded(file_bytes, mime_type, raw_ocr_text=extracted_text)
            )
        finally:
            loop.close()

    status_str = "success" if len(detected_markers) >= 2 else ("partial" if len(detected_markers) == 1 else "no_markers_found")
    message = (
        f"Extracted {len(detected_markers)} biomarker(s). Please review and confirm your readings in the table below."
        if detected_markers
        else "No recognized clinical lab biomarkers detected. You can enter your values manually below."
    )

    return LabExtractionResponse(
        id=draft_id,
        filename=filename,
        file_type="PDF" if is_pdf else "Image",
        page_count=page_count,
        detected_markers=detected_markers,
        unclear_glucose_flag=unclear_glucose,
        phi_redacted=True,
        status=status_str,
        message=message
    )


# ==============================================================================
# CLINICAL INTERPRETATION RULE ENGINE (ADA / AHA / ACC / NCEP)
# ==============================================================================
def evaluate_clinical_findings(payload: BiomarkerConfirmationPayload, user_sex: Optional[int] = 1) -> LabFindingsReport:
    """
    Evaluates confirmed lab biomarker measurements using clinical_thresholds.json.
    Adheres strictly to the principle:
    - Never diagnose.
    - Standardized phrasing: "in the X range on this test; confirm with a clinician".
    - Includes repeat testing note where relevant.
    """
    findings: List[ClinicalFindingItem] = []
    max_severity = 1

    # 1. Fasting Glucose (ADA Standards of Care)
    if payload.fasting_glucose is not None:
        val = payload.fasting_glucose
        matched_rule = None
        for rule in THRESHOLDS_CONFIG.get("fasting_glucose", []):
            min_v = rule.get("min", -float("inf"))
            max_v = rule.get("max", float("inf"))
            if min_v <= val <= max_v:
                matched_rule = rule
                break
        if matched_rule:
            findings.append(ClinicalFindingItem(
                biomarker="Fasting Blood Glucose",
                canonical_key="fasting_glucose",
                value=val,
                unit="mg/dL",
                category=matched_rule["category"],
                severity_level=matched_rule["severity"],
                message=matched_rule["message"],
                repeat_note=matched_rule.get("repeat_note"),
                reference_range="< 100 mg/dL"
            ))
            max_severity = max(max_severity, matched_rule["severity"])

    # 2. HbA1c (ADA Standards of Care)
    if payload.hba1c is not None:
        val = payload.hba1c
        matched_rule = None
        for rule in THRESHOLDS_CONFIG.get("hba1c", []):
            min_v = rule.get("min", -float("inf"))
            max_v = rule.get("max", float("inf"))
            if min_v <= val <= max_v:
                matched_rule = rule
                break
        if matched_rule:
            findings.append(ClinicalFindingItem(
                biomarker="Hemoglobin A1c (HbA1c)",
                canonical_key="hba1c",
                value=val,
                unit="%",
                category=matched_rule["category"],
                severity_level=matched_rule["severity"],
                message=matched_rule["message"],
                repeat_note=matched_rule.get("repeat_note"),
                reference_range="< 5.7 %"
            ))
            max_severity = max(max_severity, matched_rule["severity"])

    # 3. Total Cholesterol (ACC/AHA Guidelines)
    if payload.total_cholesterol is not None:
        val = payload.total_cholesterol
        matched_rule = None
        for rule in THRESHOLDS_CONFIG.get("total_cholesterol", []):
            min_v = rule.get("min", -float("inf"))
            max_v = rule.get("max", float("inf"))
            if min_v <= val <= max_v:
                matched_rule = rule
                break
        if matched_rule:
            findings.append(ClinicalFindingItem(
                biomarker="Total Cholesterol",
                canonical_key="total_cholesterol",
                value=val,
                unit="mg/dL",
                category=matched_rule["category"],
                severity_level=matched_rule["severity"],
                message=matched_rule["message"],
                repeat_note=matched_rule.get("repeat_note"),
                reference_range="< 200 mg/dL"
            ))
            max_severity = max(max_severity, matched_rule["severity"])

    # 4. LDL Cholesterol (ACC/AHA Guidelines)
    if payload.ldl_cholesterol is not None:
        val = payload.ldl_cholesterol
        matched_rule = None
        for rule in THRESHOLDS_CONFIG.get("ldl_cholesterol", []):
            min_v = rule.get("min", -float("inf"))
            max_v = rule.get("max", float("inf"))
            if min_v <= val <= max_v:
                matched_rule = rule
                break
        if matched_rule:
            findings.append(ClinicalFindingItem(
                biomarker="LDL Cholesterol",
                canonical_key="ldl_cholesterol",
                value=val,
                unit="mg/dL",
                category=matched_rule["category"],
                severity_level=matched_rule["severity"],
                message=matched_rule["message"],
                repeat_note=matched_rule.get("repeat_note"),
                reference_range="< 100 mg/dL"
            ))
            max_severity = max(max_severity, matched_rule["severity"])

    # 5. HDL Cholesterol (Sex-Specific Stratification)
    if payload.hdl_cholesterol is not None:
        val = payload.hdl_cholesterol
        sex_key = "female" if user_sex == 0 else "male"
        hdl_rules = THRESHOLDS_CONFIG.get("hdl_cholesterol", {}).get(sex_key, [])
        matched_rule = None
        for rule in hdl_rules:
            min_v = rule.get("min", -float("inf"))
            max_v = rule.get("max", float("inf"))
            if min_v <= val <= max_v:
                matched_rule = rule
                break
        if matched_rule:
            findings.append(ClinicalFindingItem(
                biomarker="HDL Cholesterol",
                canonical_key="hdl_cholesterol",
                value=val,
                unit="mg/dL",
                category=matched_rule["category"],
                severity_level=matched_rule["severity"],
                message=matched_rule["message"],
                repeat_note=matched_rule.get("repeat_note"),
                reference_range="≥ 50 mg/dL" if sex_key == "female" else "≥ 40 mg/dL"
            ))
            max_severity = max(max_severity, matched_rule["severity"])

    # 6. Triglycerides (AHA Guidelines)
    if payload.triglycerides is not None:
        val = payload.triglycerides
        matched_rule = None
        for rule in THRESHOLDS_CONFIG.get("triglycerides", []):
            min_v = rule.get("min", -float("inf"))
            max_v = rule.get("max", float("inf"))
            if min_v <= val <= max_v:
                matched_rule = rule
                break
        if matched_rule:
            findings.append(ClinicalFindingItem(
                biomarker="Triglycerides",
                canonical_key="triglycerides",
                value=val,
                unit="mg/dL",
                category=matched_rule["category"],
                severity_level=matched_rule["severity"],
                message=matched_rule["message"],
                repeat_note=matched_rule.get("repeat_note"),
                reference_range="< 150 mg/dL"
            ))
            max_severity = max(max_severity, matched_rule["severity"])

    # 7. Blood Pressure (AHA/ACC 2017 Guidelines)
    if payload.bp_systolic is not None or payload.bp_diastolic is not None:
        sys_bp = payload.bp_systolic if payload.bp_systolic is not None else 120.0
        dia_bp = payload.bp_diastolic if payload.bp_diastolic is not None else 80.0
        matched_rule = None

        if sys_bp > 180 or dia_bp > 120:
            category, sev = "hypertensive crisis range", 4
            msg = "Blood pressure is in the hypertensive crisis range on this test; confirm with a clinician."
            rep = "Emergency medical consultation advised if accompanied by acute chest pain, shortness of breath, or headache."
        elif sys_bp >= 140 or dia_bp >= 90:
            category, sev = "stage 2 hypertension range", 3
            msg = "Blood pressure is in the stage 2 hypertension range on this test; confirm with a clinician."
            rep = "Confirm with repeat measurements across multiple clinical visits."
        elif (130 <= sys_bp < 140) or (80 <= dia_bp < 90):
            category, sev = "stage 1 hypertension range", 2
            msg = "Blood pressure is in the stage 1 hypertension range on this test; confirm with a clinician."
            rep = "AHA recommends home blood pressure monitoring and repeat clinical evaluation."
        elif 120 <= sys_bp < 130 and dia_bp < 80:
            category, sev = "elevated", 1
            msg = "Blood pressure is in the elevated range on this test; confirm with a clinician."
            rep = "Lifestyle and dietary sodium review recommended."
        else:
            category, sev = "normal", 1
            msg = "Blood pressure is in the normal range on this test; confirm with a clinician."
            rep = None

        findings.append(ClinicalFindingItem(
            biomarker="Resting Blood Pressure",
            canonical_key="blood_pressure",
            value=sys_bp,
            unit="mmHg",
            category=category,
            severity_level=sev,
            message=msg,
            repeat_note=rep,
            reference_range="< 120/80 mmHg"
        ))
        max_severity = max(max_severity, sev)

    # Derive Model Inputs & Tiered Confidence
    model_inputs = derive_model_inputs_from_labs(payload)

    summary_status = "optimal" if max_severity == 1 else ("borderline" if max_severity == 2 else ("elevated" if max_severity == 3 else "critical"))

    return LabFindingsReport(
        total_markers_evaluated=len(findings),
        summary_status=summary_status,
        findings=findings,
        model_inputs=model_inputs,
        disagreement_flag=False,
        disagreement_note=None,
        timestamp=datetime.now(timezone.utc).isoformat()
    )


def derive_model_inputs_from_labs(payload: BiomarkerConfirmationPayload) -> ModelInputMapping:
    """
    Transforms confirmed lab biomarkers into parameters for the existing Heart Disease
    (Logistic Regression) and Diabetes (XGBoost) models.
    Strict rules:
    - Heart Model:
      * chol = total_cholesterol
      * fbs = 1 if confirmed FASTING glucose > 120 mg/dL, else 0 (random/postprandial CANNOT set fbs)
      * trestbps = systolic BP if present
      * Confidence tier becomes "standard" ONLY when all 3 values (BP, cholesterol, fasting glucose) are confirmed.
    - Diabetes Model:
      * HighChol = 1 if total_cholesterol >= 240 (raw reading takes precedence over survey)
      * HighBP = 1 if bp_systolic >= 130 or bp_diastolic >= 80
      * Glucose & HbA1c are NOT diabetes model inputs
    """
    # 1. Heart Model Parameters
    trestbps_val = payload.bp_systolic
    chol_val = payload.total_cholesterol

    # Glucose distinction: Only confirmed FASTING glucose can set fbs
    fasting_val = payload.fasting_glucose
    if payload.glucose_type == "fasting" and fasting_val is None:
        fasting_val = payload.random_glucose or payload.postprandial_glucose

    imputed_fields = []
    if trestbps_val is None:
        trestbps_val = 130.0  # Population median
        imputed_fields.append("trestbps")

    if chol_val is None:
        chol_val = 240.0  # Population median
        imputed_fields.append("chol")

    if fasting_val is None:
        fbs_val = 0.0  # Population median
        imputed_fields.append("fbs")
    else:
        fbs_val = 1.0 if fasting_val > 120.0 else 0.0

    # Tiered Confidence Calculation:
    # "standard": All three clinical values (trestbps, chol, fbs) are confirmed from lab
    # "partial": At least one of trestbps or chol is verified from lab
    # "screening": None of the clinical measurements were available
    if len(imputed_fields) == 0:
        confidence_tier = "standard"
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

    # 2. Diabetes Model Parameters
    # HighChol = 1 if cholesterol >= 240 mg/dL
    high_chol = 1.0 if (payload.total_cholesterol is not None and payload.total_cholesterol >= 240.0) else 0.0
    sys_bp = payload.bp_systolic
    dia_bp = payload.bp_diastolic
    high_bp = 1.0 if (sys_bp is not None and sys_bp >= 130.0) or (dia_bp is not None and dia_bp >= 80.0) else 0.0

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


def check_disagreement(findings: List[ClinicalFindingItem], model_results: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    """
    Checks if rule-based lab findings and ML model risk estimates diverge.
    If they disagree, returns (True, explanatory_note).
    """
    has_high_lab_finding = any(f.severity_level >= 3 for f in findings)
    all_optimal_lab_findings = all(f.severity_level == 1 for f in findings) if findings else False

    d_res = model_results.get("diabetes", {}) or {}
    h_res = model_results.get("heartDisease", {}) or {}
    d_high = d_res.get("risk", {}).get("isHighRisk", False)
    h_high = h_res.get("risk", {}).get("isHighRisk", False)

    # Disagreement Case 1: Lab findings indicate high/elevated readings, but model predicts low risk
    if has_high_lab_finding and not (d_high or h_high):
        return (
            True,
            "Lab findings indicate readings in the elevated or high range, whereas the statistical screening model predicted lower risk. Direct biological laboratory measurements take precedence; consult a clinician for repeat diagnostic evaluation."
        )

    # Disagreement Case 2: Lab findings are desirable/optimal, but model predicts high risk
    if all_optimal_lab_findings and (d_high or h_high):
        return (
            True,
            "Lab findings are within desirable reference intervals, whereas the lifestyle and demographic model highlights elevated risk. Consult a clinician to interpret both within your complete clinical picture."
        )

    return False, None
