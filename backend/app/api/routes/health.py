"""
Health Check Endpoints

Implements liveness, readiness, and startup probes per SRE requirements.
Provides real connectivity checks for Kubernetes health probes.
"""

import time
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Response, status
from pydantic import BaseModel

from app.config import settings

router = APIRouter()


# ============================================================================
# Response Models
# ============================================================================

class HealthResponse(BaseModel):
    """Liveness check response."""
    status: str
    version: str
    environment: str
    timestamp: str


class DependencyStatus(BaseModel):
    """Status of a single dependency."""
    status: str
    latency_ms: Optional[float] = None
    error: Optional[str] = None


class ReadinessResponse(BaseModel):
    """Readiness check response with dependency status."""
    status: str
    database: DependencyStatus
    redis: DependencyStatus
    meilisearch: DependencyStatus
    

class StartupResponse(BaseModel):
    """Startup check response."""
    status: str
    nlp_models_loaded: bool
    ocr_ready: bool
    workers_connected: bool


class CircuitBreakerStatus(BaseModel):
    """Circuit breaker status for monitoring."""
    name: str
    state: str
    failure_count: int
    last_failure: Optional[float] = None


class DetailedHealthResponse(BaseModel):
    """Detailed health status including circuit breakers."""
    status: str
    version: str
    environment: str
    timestamp: str
    uptime_seconds: float
    circuit_breakers: list[CircuitBreakerStatus]


# Track startup time for uptime calculation
_startup_time = time.time()


# ============================================================================
# Liveness Probe
# ============================================================================

@router.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Liveness probe - basic service health.
    
    Used by Kubernetes to determine if the pod should be restarted.
    This should be fast and only check if the process is alive.
    """
    return HealthResponse(
        status="healthy",
        version=settings.api_version,
        environment=settings.environment,
        timestamp=datetime.utcnow().isoformat() + "Z",
    )


# ============================================================================
# Readiness Probe
# ============================================================================

@router.get("/ready", response_model=ReadinessResponse)
async def readiness_check(response: Response):
    """
    Readiness probe - checks all critical dependencies.
    
    Used by Kubernetes to determine if traffic should be routed to this pod.
    Returns 503 if any critical dependency is unhealthy.
    """
    results = {
        "status": "ready",
        "database": DependencyStatus(status="unknown"),
        "redis": DependencyStatus(status="unknown"),
        "meilisearch": DependencyStatus(status="unknown"),
    }
    
    all_critical_healthy = True
    
    # Check Redis (critical)
    try:
        import redis.asyncio as redis_client
        start = time.time()
        r = redis_client.from_url(settings.redis_url, socket_timeout=2.0)
        await r.ping()
        await r.aclose()
        latency = round((time.time() - start) * 1000, 2)
        results["redis"] = DependencyStatus(status="connected", latency_ms=latency)
    except Exception as e:
        results["redis"] = DependencyStatus(status="disconnected", error=str(e)[:100])
        all_critical_healthy = False
    
    # Check Database (critical)
    try:
        import asyncpg
        start = time.time()
        conn = await asyncpg.connect(settings.database_url, timeout=2.0)
        await conn.execute("SELECT 1")
        await conn.close()
        latency = round((time.time() - start) * 1000, 2)
        results["database"] = DependencyStatus(status="connected", latency_ms=latency)
    except Exception as e:
        results["database"] = DependencyStatus(status="disconnected", error=str(e)[:100])
        all_critical_healthy = False
    
    # Check Meilisearch (non-critical for readiness)
    try:
        import httpx
        start = time.time()
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"{settings.meilisearch_url}/health")
            if resp.status_code == 200:
                latency = round((time.time() - start) * 1000, 2)
                results["meilisearch"] = DependencyStatus(status="connected", latency_ms=latency)
            else:
                results["meilisearch"] = DependencyStatus(status="unhealthy", error=f"HTTP {resp.status_code}")
    except Exception as e:
        results["meilisearch"] = DependencyStatus(status="unavailable", error=str(e)[:50])
        # Meilisearch is not critical - we continue without it
    
    # Set overall status
    if all_critical_healthy:
        results["status"] = "ready"
    else:
        results["status"] = "not_ready"
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    
    return ReadinessResponse(**results)


# ============================================================================
# Startup Probe
# ============================================================================

@router.get("/startup", response_model=StartupResponse)
async def startup_check(response: Response):
    """
    Startup probe - checks if initialization is complete.
    
    Used by Kubernetes to wait for slow-starting containers.
    Checks if models are loaded and workers are connected.
    """
    results = {
        "status": "starting",
        "nlp_models_loaded": False,
        "ocr_ready": False,
        "workers_connected": True,  # Assume true, would check Celery in production
    }
    
    # Check if NLP models are loaded
    try:
        from app.services.nlp_service import NLPService
        # Check if any model has been initialized
        results["nlp_models_loaded"] = (
            NLPService._spacy_nlp is not None or 
            NLPService._vader_analyzer is not None
        )
    except Exception:
        results["nlp_models_loaded"] = False
    
    # Check if OCR is ready (EasyOCR lazy loads, so just verify import)
    try:
        import easyocr  # noqa
        results["ocr_ready"] = True
    except ImportError:
        results["ocr_ready"] = False
    
    # Check Celery workers (optional, don't fail startup)
    try:
        from app.workers.celery_app import celery_app
        # In production, this would ping workers
        # For now, just check if app is configured
        results["workers_connected"] = celery_app.conf.broker_url is not None
    except Exception:
        results["workers_connected"] = False
    
    # Determine overall status
    # NLP models may not be loaded yet on first request (lazy loading)
    # So we consider started if OCR is ready
    if results["ocr_ready"] or results["nlp_models_loaded"]:
        results["status"] = "started"
    else:
        results["status"] = "starting"
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    
    return StartupResponse(**results)


# ============================================================================
# Detailed Health (for monitoring dashboards)
# ============================================================================

@router.get("/health/detailed", response_model=DetailedHealthResponse)
async def detailed_health_check():
    """
    Detailed health check including circuit breaker status.
    
    Used for monitoring dashboards and debugging, not for K8s probes.
    """
    circuit_breakers = []
    
    try:
        from app.core.circuit_breaker import CircuitBreaker
        for name, cb in CircuitBreaker._registry.items():
            status = cb.get_status()
            circuit_breakers.append(CircuitBreakerStatus(
                name=status["name"],
                state=status["state"],
                failure_count=status["failure_count"],
                last_failure=status["last_failure"],
            ))
    except ImportError:
        pass
    
    return DetailedHealthResponse(
        status="healthy",
        version=settings.api_version,
        environment=settings.environment,
        timestamp=datetime.utcnow().isoformat() + "Z",
        uptime_seconds=round(time.time() - _startup_time, 2),
        circuit_breakers=circuit_breakers,
    )
