from typing import Optional
from pydantic import BaseModel, Field

class HealthStatusResponse(BaseModel):
    status: str = Field(..., description="Overall backend service status ('healthy' or 'unhealthy')")
    mongodb: str = Field(..., description="Status of the MongoDB connectivity check ('connected' or 'disconnected')")
    models: Optional[str] = Field(default="loaded", description="Status of ML models ('loaded' or 'not_loaded')")
    message: str = Field(..., description="Status description message")

