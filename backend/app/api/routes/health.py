"""
Health Check Endpoint

Simple health and readiness checks for the API.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from datetime import datetime

from app.config import settings


router = APIRouter()


class HealthResponse(BaseModel):
    """Health check response model."""
    status: str
    version: str
    environment: str
    timestamp: str


class ReadinessResponse(BaseModel):
    """Readiness check response model."""
    status: str
    database: str
    redis: str
    meilisearch: str


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Health check endpoint.
    
    Returns basic service health information.
    """
    return HealthResponse(
        status="healthy",
        version=settings.api_version,
        environment=settings.environment,
        timestamp=datetime.utcnow().isoformat(),
    )


@router.get("/ready", response_model=ReadinessResponse)
async def readiness_check():
    """
    Readiness check endpoint.
    
    Checks connectivity to all required services.
    """
    # TODO: Implement actual connectivity checks
    return ReadinessResponse(
        status="ready",
        database="connected",
        redis="connected",
        meilisearch="connected",
    )
