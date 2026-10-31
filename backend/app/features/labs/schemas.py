from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any


class ExtractedBiomarkerItem(BaseModel):
    name: str
    canonical_key: str
    value: Optional[float] = None
    unit: Optional[str] = None
    reference_range: Optional[str] = None
    flag: Optional[str] = None  # "H", "L", "HIGH", "LOW", etc.
    confidence: str = "high"  # "high", "medium", "low"
    source_snippet: Optional[str] = None
    glucose_type: Optional[str] = None  # "fasting", "random", "postprandial", "unknown"

    model_config = ConfigDict(extra="ignore")


class LabExtractionResponse(BaseModel):
    id: str  # Report ID or draft session ID
    filename: str
    file_type: str
    page_count: int = 1
    detected_markers: Dict[str, ExtractedBiomarkerItem]
    unclear_glucose_flag: bool = False
    phi_redacted: bool = True
    status: str = "success"  # "success", "partial", "no_markers_found"
    message: Optional[str] = None

    model_config = ConfigDict(extra="ignore")


class BiomarkerConfirmationPayload(BaseModel):
    test_date: Optional[str] = Field(None, description="Date of lab specimen collection (YYYY-MM-DD)")
    glucose_type: Optional[str] = Field(None, description="Confirmed glucose type: fasting, random, postprandial, or unknown")
    fasting_glucose: Optional[float] = Field(None, ge=20, le=800, description="Fasting Blood Glucose in mg/dL")
    random_glucose: Optional[float] = Field(None, ge=20, le=800, description="Random Blood Glucose in mg/dL")
    postprandial_glucose: Optional[float] = Field(None, ge=20, le=800, description="Post-prandial Glucose in mg/dL")
    hba1c: Optional[float] = Field(None, ge=3.0, le=25.0, description="Hemoglobin A1c in %")
    total_cholesterol: Optional[float] = Field(None, ge=30, le=1000, description="Total Cholesterol in mg/dL")
    ldl_cholesterol: Optional[float] = Field(None, ge=10, le=800, description="LDL Cholesterol in mg/dL")
    hdl_cholesterol: Optional[float] = Field(None, ge=5, le=250, description="HDL Cholesterol in mg/dL")
    triglycerides: Optional[float] = Field(None, ge=10, le=2500, description="Triglycerides in mg/dL")
    bp_systolic: Optional[float] = Field(None, ge=40, le=300, description="Systolic Blood Pressure in mmHg")
    bp_diastolic: Optional[float] = Field(None, ge=30, le=200, description="Diastolic Blood Pressure in mmHg")
    units: Optional[Dict[str, str]] = Field(default_factory=dict, description="Chosen units per analyte")
    notes: Optional[str] = None

    model_config = ConfigDict(extra="allow")


class ClinicalFindingItem(BaseModel):
    biomarker: str
    canonical_key: str
    value: float
    unit: str
    category: str  # e.g., "normal", "prediabetes range", "desirable", "borderline high", "high"
    severity_level: int  # 1 (normal/optimal), 2 (borderline/prediabetes), 3 (elevated/high), 4 (very high/critical)
    message: str  # Standardized: "in the X range on this test; confirm with a clinician"
    repeat_note: Optional[str] = None  # Note on repeat testing confirmation per ADA/AHA
    reference_range: Optional[str] = None

    model_config = ConfigDict(extra="ignore")


class ModelInputMapping(BaseModel):
    heart_disease: Dict[str, Any]
    diabetes: Dict[str, Any]
    confidence_tier: str  # "standard", "partial", "screening"
    imputed_fields: List[str]


class LabFindingsReport(BaseModel):
    total_markers_evaluated: int
    summary_status: str  # "optimal", "normal", "borderline", "elevated", "critical"
    findings: List[ClinicalFindingItem]
    model_inputs: ModelInputMapping
    disagreement_flag: bool = False
    disagreement_note: Optional[str] = None
    timestamp: str

    model_config = ConfigDict(extra="ignore")


class ConfirmedLabReportResponse(BaseModel):
    id: str
    user_id: str
    test_date: Optional[str] = None
    status: str = "confirmed"
    confirmed_values: Dict[str, Any]
    report: LabFindingsReport
    model_risk: Optional[Dict[str, Any]] = None
    created_at: str

    model_config = ConfigDict(extra="ignore")


class PaginatedLabReportsResponse(BaseModel):
    reports: List[ConfirmedLabReportResponse]
    total_count: int
    page: int
    limit: int
    total_pages: int
