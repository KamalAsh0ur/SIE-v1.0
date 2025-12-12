"""
SIE Backend Configuration

Load settings from environment variables with Pydantic.
"""

from functools import lru_cache
from typing import Optional
import warnings

from pydantic import model_validator
from pydantic_settings import BaseSettings


# Default/example secrets that should NEVER be used in production
INSECURE_SECRETS = {
    "change-me-in-production",
    "your-secret-key-here", 
    "secret",
    "password",
    "changeme",
}


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

    # Database connection pool - for high concurrency
    db_pool_size: int = 20
    db_max_overflow: int = 30
    db_pool_timeout: int = 30
    db_pool_recycle: int = 1800  # Recycle connections after 30 minutes

    # Redis cluster support
    redis_cluster_mode: bool = False
    redis_cluster_nodes: Optional[str] = None  # Comma-separated list for cluster

    # Rate limiting
    rate_limit_enabled: bool = True
    rate_limit_default: int = 100  # Jobs per minute per tenant

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
    
    # Memory management
    job_ttl_hours: int = 24  # Hours to keep jobs in memory before cleanup

    @model_validator(mode='after')
    def validate_production_secrets(self):
        """Validate that production doesn't use insecure default secrets."""
        if self.environment == "production" or not self.debug:
            if self.api_secret_key in INSECURE_SECRETS:
                raise ValueError(
                    "SECURITY ERROR: API_SECRET_KEY must be changed from default value in production! "
                    "Generate a secure key with: openssl rand -hex 32"
                )
        elif self.api_secret_key in INSECURE_SECRETS:
            warnings.warn(
                "⚠️  Using default API_SECRET_KEY. Change this before deploying to production!",
                UserWarning
            )
        return self

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
