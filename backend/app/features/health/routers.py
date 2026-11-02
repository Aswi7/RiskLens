import logging
from fastapi import APIRouter, Depends, status, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.db.mongodb import get_database
from app.ml.loader import ml_loader
from app.features.health.schemas import HealthStatusResponse

logger = logging.getLogger("risklens.health")
router = APIRouter()

@router.get(
    "/health",
    response_model=HealthStatusResponse,
    status_code=status.HTTP_200_OK,
    tags=["Health"]
)
async def check_health(db: AsyncIOMotorDatabase = Depends(get_database)):
    """Liveness probe. Returns 200 with service and model status summary."""
    mongodb_status = "disconnected"
    overall_status = "healthy"
    message = "Service is running."
    
    models_loaded = (
        ml_loader.loaded and
        ml_loader.heart_model is not None and
        ml_loader.diabetes_model is not None
    )
    models_status = "loaded" if models_loaded else "not_loaded"

    if db is not None:
        try:
            await db.command("ping")
            mongodb_status = "connected"
            message = "All services are functioning normally."
        except Exception as e:
            logger.error(f"MongoDB ping failed during health check: {e}")
            mongodb_status = "disconnected"
            message = "Database service unavailable."
    
    return HealthStatusResponse(
        status=overall_status,
        mongodb=mongodb_status,
        models=models_status,
        message=message
    )


@router.get(
    "/ready",
    response_model=HealthStatusResponse,
    status_code=status.HTTP_200_OK,
    tags=["Health"]
)
async def readiness_check(db: AsyncIOMotorDatabase = Depends(get_database)):
    """
    Readiness probe endpoint.
    Verifies that all trained ML models (XGBoost, LogisticRegression, Scalers)
    are loaded into memory and ready to serve inference.
    Returns 200 OK if ready, 503 Service Unavailable if models are not yet initialized.
    """
    models_loaded = (
        ml_loader.loaded and
        ml_loader.heart_model is not None and
        ml_loader.diabetes_model is not None
    )
    models_status = "loaded" if models_loaded else "not_loaded"

    mongodb_status = "disconnected"
    if db is not None:
        try:
            await db.command("ping")
            mongodb_status = "connected"
        except Exception as e:
            logger.error(f"MongoDB ping failed during readiness check: {e}")

    if not models_loaded:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ML models not initialized or loaded into memory yet."
        )

    return HealthStatusResponse(
        status="healthy",
        mongodb=mongodb_status,
        models=models_status,
        message="RiskLens inference engine is fully initialized and ready."
    )

