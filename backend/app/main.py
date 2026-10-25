import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.mongodb import connect_to_mongo, close_mongo_connection
from app.ml.loader import ml_loader
from app.features.health.routers import router as health_router
from app.features.auth.routers import router as auth_router
from app.features.predictions.routers import router as predictions_router
from app.features.llm.routers import router as llm_router
from app.features.hospitals.routers import router as hospitals_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("risklens.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Connect to MongoDB & Load ML Models ONCE
    logger.info("Starting RiskLens API server...")
    await connect_to_mongo()
    ml_loader.load_artifacts()
    yield
    # Shutdown: Close DB connections
    logger.info("Shutting down RiskLens API server...")
    await close_mongo_connection()


app = FastAPI(
    title=settings.PROJECT_NAME,
    description="RiskLens Multi-Disease Early Prediction, SHAP Explainability & Personalized AI Advice API",
    version="1.0.0",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    lifespan=lifespan,
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(auth_router)
app.include_router(predictions_router)
app.include_router(llm_router)
app.include_router(hospitals_router)
app.include_router(health_router)


import math
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc: RequestValidationError):
    errors = []
    for err in exc.errors():
        clean_err = dict(err)
        inp = clean_err.get("input")
        if isinstance(inp, float) and (math.isnan(inp) or math.isinf(inp)):
            clean_err["input"] = str(inp)
        # Handle tuple or dict input that might contain nan/inf
        errors.append(clean_err)
    return JSONResponse(status_code=422, content={"detail": errors})


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=getattr(exc, "headers", None)
    )


@app.exception_handler(Exception)
async def global_exception_handler(request, exc: Exception):
    logger.error(f"Unhandled server error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "An internal server error occurred. Please try again later.",
            "error_type": "InternalServerError"
        }
    )





@app.get("/", tags=["Root"])
async def root():
    return {
        "project": settings.PROJECT_NAME,
        "message": "Welcome to RiskLens API server. Access /health for status, or /docs for interactive API documentation."
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG
    )
