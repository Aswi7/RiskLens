from typing import List
from pathlib import Path
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "RiskLens API"

    # Server Settings
    PORT: int = 8000
    HOST: str = "0.0.0.0"
    DEBUG: bool = True

    # CORS Origins (parse comma-separated string to list)
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:3000"

    @property
    def cors_origins(self) -> List[str]:
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]

    # Security Settings
    JWT_SECRET: str = "risklens_super_secret_jwt_key_2026_change_in_production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # Database Settings
    MONGODB_URI: str = "mongodb://localhost:27017"
    MONGO_DB_NAME: str = "risklens_db"

    # External LLM / Map API Keys
    GEMINI_API_KEY: str = ""
    GOOGLE_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    GOOGLE_PLACES_API_KEY: str = ""

    # ML Models Directory
    MODEL_DIR: str = ""

    @model_validator(mode="after")
    def validate_jwt_secret_in_production(self):
        default_secret = "risklens_super_secret_jwt_key_2026_change_in_production"
        if not self.DEBUG:
            if self.JWT_SECRET == default_secret or len(self.JWT_SECRET.strip()) < 32:
                raise ValueError(
                    "Security Enforcement: A non-default JWT_SECRET of at least 32 characters is required when DEBUG is off (production mode)."
                )
        return self

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )


settings = Settings()
