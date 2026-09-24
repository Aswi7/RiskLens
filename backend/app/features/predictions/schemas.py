from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List, Dict, Any


class HealthIntakePayload(BaseModel):
    # Common / Shared fields
    Sex: Optional[float] = Field(None, description="Gender: 0=Female, 1=Male")
    sex: Optional[float] = Field(None, description="Gender: 0=Female, 1=Male")
    
    Age: Optional[float] = Field(None, description="Age in years or CDC 1-13 bucket code")
    age: Optional[float] = Field(None, description="Age in years")
    
    BMI: Optional[float] = Field(None, description="Body Mass Index")

    # Diabetes specific fields
    HighBP: Optional[float] = Field(None, description="High Blood Pressure: 0=No, 1=Yes")
    HighChol: Optional[float] = Field(None, description="High Cholesterol: 0=No, 1=Yes")
    Smoker: Optional[float] = Field(None, description="Smoker (>=100 cigarettes): 0=No, 1=Yes")
    PhysActivity: Optional[float] = Field(None, description="Physical Activity in past 30 days: 0=No, 1=Yes")
    Fruits: Optional[float] = Field(None, description="Fruit consumption >= 1x/day: 0=No, 1=Yes")
    Veggies: Optional[float] = Field(None, description="Vegetable consumption >= 1x/day: 0=No, 1=Yes")
    HvyAlcoholConsump: Optional[float] = Field(None, description="Heavy alcohol drinker: 0=No, 1=Yes")
    Stroke: Optional[float] = Field(None, description="History of stroke: 0=No, 1=Yes")
    HeartDiseaseorAttack: Optional[float] = Field(None, description="Coronary heart disease or myocardial infarction: 0=No, 1=Yes")
    DiffWalk: Optional[float] = Field(None, description="Difficulty walking or climbing stairs: 0=No, 1=Yes")
    GenHlth: Optional[float] = Field(None, description="General Health scale 1-5 (1=Excellent, 5=Poor)")
    MentHlth: Optional[float] = Field(None, description="Days of poor mental health in past 30 days (0-30)")
    PhysHlth: Optional[float] = Field(None, description="Days of physical illness/injury in past 30 days (0-30)")

    # Heart Disease specific fields
    cp: Optional[float] = Field(None, description="Chest Pain Type: 0, 1, 2, 3")
    trestbps: Optional[float] = Field(None, description="Resting blood pressure in mmHg")
    chol: Optional[float] = Field(None, description="Serum cholesterol in mg/dl")
    fbs: Optional[float] = Field(None, description="Fasting blood sugar > 120 mg/dl: 0=False, 1=True")
    exang: Optional[float] = Field(None, description="Exercise induced angina: 0=No, 1=Yes")

    model_config = ConfigDict(extra="allow")


class RiskDetail(BaseModel):
    probability: float
    isHighRisk: bool
    riskLevel: str
    threshold: float


class DiseaseRiskResult(BaseModel):
    risk: Optional[RiskDetail] = None
    shapValues: Optional[Dict[str, float]] = None
    status: str  # "success" or "insufficient_data"
    missingFields: Optional[List[str]] = None


class PredictionResponse(BaseModel):
    diabetes: DiseaseRiskResult
    heartDisease: DiseaseRiskResult


class PredictionRecord(BaseModel):
    id: str
    user_id: str
    timestamp: str
    input_payload: Dict[str, Any]
    results: PredictionResponse
