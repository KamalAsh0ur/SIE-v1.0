"""
SIE Backend Configuration

Load settings from environment variables with Pydantic.
"""

from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Environment
    environment: str = "development"
    debug: bool = True

    # API
    api_title: str = "Smart Ingestion Engine"
    api_version: str = "1.0.0"
    api_prefix: str = "/api/v1"
    api_secret_key: str = "change-me-in-production"

    # Database
    database_url: str

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Meilisearch
    meilisearch_url: str = "http://localhost:7700"
    meilisearch_key: Optional[str] = None

    # Celery
    celery_broker_url: Optional[str] = None
    celery_result_backend: Optional[str] = None

    # Sentry
    sentry_dsn: Optional[str] = None

    # NLP Settings
    nlp_model: str = "en_core_web_sm"
    nlp_batch_size: int = 100
    nlp_sentiment_threshold: float = 0.05  # Compound score threshold for neutral

    # OCR Settings
    ocr_languages: str = "en"  # Comma-separated list of language codes
    ocr_gpu: bool = False
    ocr_preprocess: bool = True
    ocr_preprocess_quality: str = "balanced"  # fast, balanced, best
    ocr_confidence_threshold: float = 0.5
    ocr_fallback_enabled: bool = True  # Use Tesseract as fallback
    
    @property
    def ocr_languages_list(self) -> list:
        """Get OCR languages as a list."""
        return [lang.strip() for lang in self.ocr_languages.split(",")]

    # Archive Settings
    archive_provider: str = "local"  # local, r2, b2, s3
    archive_bucket: str = "sie-archive"
    archive_endpoint_url: Optional[str] = None
    archive_access_key: Optional[str] = None
    archive_secret_key: Optional[str] = None

    # Rate Limiting
    rate_limit_per_minute: int = 60

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False

    @property
    def celery_broker(self) -> str:
        """Get Celery broker URL, defaulting to Redis URL."""
        return self.celery_broker_url or self.redis_url

    @property
    def celery_backend(self) -> str:
        """Get Celery result backend URL, defaulting to Redis URL."""
        return self.celery_result_backend or self.redis_url


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
