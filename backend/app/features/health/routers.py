from fastapi import APIRouter, Depends, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.db.mongodb import get_database
from app.features.health.schemas import HealthStatusResponse

router = APIRouter()

@router.get(
    "/health",
    response_model=HealthStatusResponse,
    status_code=status.HTTP_200_OK,
    tags=["Health"]
)
async def check_health(db: AsyncIOMotorDatabase = Depends(get_database)):
    """Health check endpoint. Verifies connectivity to MongoDB and validates via Pydantic v2."""
    mongodb_status = "disconnected"
    overall_status = "unhealthy"
    message = "MongoDB client is not initialized."

    if db is not None:
        try:
            # Ping the database using Motor (asynchronous command)
            await db.command("ping")
            mongodb_status = "connected"
            overall_status = "healthy"
            message = "All services are functioning normally."
        except Exception as e:
            message = f"Failed to connect to MongoDB: {str(e)}"
    
    return HealthStatusResponse(
        status=overall_status,
        mongodb=mongodb_status,
        message=message
    )
