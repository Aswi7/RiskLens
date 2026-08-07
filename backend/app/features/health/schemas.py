from pydantic import BaseModel, Field

class HealthStatusResponse(BaseModel):
    status: str = Field(..., description="Overall backend service status ('healthy' or 'unhealthy')")
    mongodb: str = Field(..., description="Status of the MongoDB connectivity check ('connected' or 'disconnected')")
    message: str = Field(..., description="Status description message")
