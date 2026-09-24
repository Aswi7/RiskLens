import os
import json
import joblib
import shap
import numpy as np
import logging
from pathlib import Path
from typing import Dict, Any, Optional
from app.core.config import settings

logger = logging.getLogger("risklens.ml")

class MLLoader:
    diabetes_model: Any = None
    diabetes_scaler: Any = None
    diabetes_meta: Dict[str, Any] = {}
    diabetes_explainer: Any = None

    heart_model: Any = None
    heart_scaler: Any = None
    heart_meta: Dict[str, Any] = {}
    heart_explainer: Any = None

    loaded: bool = False

    @classmethod
    def resolve_models_dir(cls) -> Path:
        """Locates the ml_models/trained_models directory across possible path roots."""
        candidates = []
        if settings.MODEL_DIR:
            candidates.append(Path(settings.MODEL_DIR))

        backend_dir = Path(__file__).resolve().parent.parent.parent
        root_dir = backend_dir.parent

        candidates.extend([
            root_dir / "ml_models" / "trained_models",
            backend_dir / "ml_models" / "trained_models",
            Path("ml_models/trained_models"),
            Path("../ml_models/trained_models"),
        ])

        for cand in candidates:
            if cand.exists() and (cand / "diabetes_meta.json").exists():
                return cand.resolve()

        raise FileNotFoundError(
            f"Could not locate trained_models directory. Searched in: {[str(c) for c in candidates]}"
        )

    @classmethod
    def load_artifacts(cls):
        """Loads models, scalers, metadata configs, and initializes SHAP explainers once at startup."""
        if cls.loaded:
            return

        models_dir = cls.resolve_models_dir()
        logger.info(f"Loading ML artifacts from: {models_dir}")

        # Load Diabetes metadata & artifacts
        with open(models_dir / "diabetes_meta.json", "r", encoding="utf-8") as f:
            cls.diabetes_meta = json.load(f)

        cls.diabetes_model = joblib.load(models_dir / "diabetes_model.joblib")
        cls.diabetes_scaler = joblib.load(models_dir / "diabetes_scaler.joblib")

        # Initialize Diabetes SHAP TreeExplainer
        cls.diabetes_explainer = shap.TreeExplainer(cls.diabetes_model)
        logger.info("Diabetes model (XGBoost) and SHAP TreeExplainer loaded successfully.")

        # Load Heart Disease metadata & artifacts
        with open(models_dir / "heart_meta.json", "r", encoding="utf-8") as f:
            cls.heart_meta = json.load(f)

        cls.heart_model = joblib.load(models_dir / "heart_model.joblib")
        cls.heart_scaler = joblib.load(models_dir / "heart_scaler.joblib")

        # Initialize Heart Disease SHAP LinearExplainer
        # Uses Independent masker over 10 encoded features
        h_masker = shap.maskers.Independent(data=np.zeros((1, 10)))
        cls.heart_explainer = shap.LinearExplainer(cls.heart_model, masker=h_masker)
        logger.info("Heart Disease model (LogisticRegression) and SHAP LinearExplainer loaded successfully.")

        cls.loaded = True

ml_loader = MLLoader
