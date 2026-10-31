from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any


class ExtractedBiomarkerItem(BaseModel):
    name: str
    canonical_key: str
    value: Optional[float] = None
    unit: Optional[str] = None
    reference_range: Optional[str] = None
    confidence: str = "high"  # "high", "medium", "low"
    source_snippet: Optional[str] = None

    model_config = ConfigDict(extra="ignore")


class LabExtractionResponse(BaseModel):
    filename: str
    file_type: str
    detected_markers: Dict[str, ExtractedBiomarkerItem]
    phi_redacted: bool = True
    status: str = "success"  # "success", "partial", "no_markers_found"
    message: Optional[str] = None

    model_config = ConfigDict(extra="ignore")


class BiomarkerConfirmationPayload(BaseModel):
    bp_systolic: Optional[float] = Field(None, ge=40, le=300, description="Systolic Blood Pressure in mmHg")
    bp_diastolic: Optional[float] = Field(None, ge=30, le=200, description="Diastolic Blood Pressure in mmHg")
    total_cholesterol: Optional[float] = Field(None, ge=30, le=1000, description="Total Cholesterol in mg/dL")
    hdl_cholesterol: Optional[float] = Field(None, ge=5, le=250, description="HDL Cholesterol in mg/dL")
    ldl_cholesterol: Optional[float] = Field(None, ge=10, le=800, description="LDL Cholesterol in mg/dL")
    triglycerides: Optional[float] = Field(None, ge=10, le=2500, description="Triglycerides in mg/dL")
    fasting_glucose: Optional[float] = Field(None, ge=20, le=800, description="Fasting Blood Glucose in mg/dL")
    random_glucose: Optional[float] = Field(None, ge=20, le=800, description="Random Blood Glucose in mg/dL")
    hba1c: Optional[float] = Field(None, ge=3.0, le=25.0, description="Hemoglobin A1c in %")
    report_date: Optional[str] = None
    lab_name: Optional[str] = None
    notes: Optional[str] = None

    model_config = ConfigDict(extra="allow")


class ClinicalFindingItem(BaseModel):
    biomarker: str
    canonical_key: str
    value: float
    unit: str
    status: str  # "optimal", "normal", "borderline", "elevated", "critical"
    severity_level: int  # 1 (optimal/normal), 2 (borderline), 3 (elevated), 4 (critical)
    reference_range: str
    clinical_finding: str
    recommendation: str

    model_config = ConfigDict(extra="ignore")


class ModelInputMapping(BaseModel):
    heart_disease: Dict[str, Any]
    diabetes: Dict[str, Any]
    confidence_tier: str  # "high", "partial", "screening"
    imputed_fields: List[str]


class LabFindingsReport(BaseModel):
    total_markers_evaluated: int
    summary_status: str  # "optimal", "normal", "borderline", "elevated", "critical"
    findings: List[ClinicalFindingItem]
    model_inputs: ModelInputMapping
    timestamp: str

    model_config = ConfigDict(extra="ignore")


class LabReportRecord(BaseModel):
    id: str
    user_id: str
    timestamp: str
    confirmed_values: BiomarkerConfirmationPayload
    report: LabFindingsReport
