"""
Ingestion Endpoint

POST /ingest - Submit ingestion jobs for processing.
Implements SRS §3.1 requirements.
"""

from datetime import datetime
from typing import Optional, List
from uuid import uuid4

from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from pydantic import BaseModel, Field, HttpUrl

from app.api.deps import get_current_tenant, verify_api_key
from app.workers.tasks import process_ingestion_job


router = APIRouter()


# ============================================================================
# Request/Response Models (SRS §3.1)
# ============================================================================

class DateRange(BaseModel):
    """Date range for historical ingestion."""
    start: datetime
    end: datetime


class IngestItem(BaseModel):
    """Individual item to ingest (for API-sourced data)."""
    id: Optional[str] = None
    content: Optional[str] = None
    url: Optional[HttpUrl] = None
    author: Optional[str] = None
    timestamp: Optional[datetime] = None
    metadata: Optional[dict] = None


class IngestRequest(BaseModel):
    """
    Ingestion job request payload.
    
    Supports both API-sourced data (items provided) and 
    scraping targets (accounts/keywords for discovery).
    """
    source_type: str = Field(
        ...,
        description="Source type: meta_api | youtube_api | scraped",
        pattern="^(meta_api|youtube_api|scraped)$"
    )
    items: Optional[List[IngestItem]] = Field(
        default=None,
        description="Pre-fetched items from API sources"
    )
    accounts: Optional[List[str]] = Field(
        default=None,
        description="Social accounts to monitor/scrape"
    )
    keywords: Optional[List[str]] = Field(
        default=None,
        description="Keywords for content discovery"
    )
    date_range: Optional[DateRange] = Field(
        default=None,
        description="Date range for historical ingestion"
    )
    mode: str = Field(
        default="realtime",
        description="Ingestion mode: historical | realtime | scheduled",
        pattern="^(historical|realtime|scheduled)$"
    )
    tenant: str = Field(
        ...,
        description="Tenant identifier"
    )
    priority: str = Field(
        default="normal",
        description="Job priority: low | normal | high",
        pattern="^(low|normal|high)$"
    )


class IngestResponse(BaseModel):
    """Ingestion job acceptance response."""
    job_id: str
    accepted_at: str
    status: str = "queued"
    message: str = "Ingestion job queued successfully"


class IngestError(BaseModel):
    """Error response for ingestion failures."""
    error: str
    detail: Optional[str] = None
    code: str


# ============================================================================
# API Endpoints
# ============================================================================

@router.post(
    "",
    response_model=IngestResponse,
    status_code=201,
    responses={
        400: {"model": IngestError, "description": "Invalid request"},
        401: {"model": IngestError, "description": "Authentication failed"},
        429: {"model": IngestError, "description": "Rate limit exceeded"},
    }
)
async def submit_ingestion_job(
    request: IngestRequest,
    background_tasks: BackgroundTasks,
    api_key: str = Depends(verify_api_key),
):
    """
    Submit a new ingestion job.
    
    Accepts raw API data or metadata for scraping. The job is 
    validated and enqueued for asynchronous processing.
    
    **SRS §3.1 Requirements:**
    - Must validate payload
    - Must enqueue job asynchronously
    - Must support retries and dead-lettering
    """
    # Validate that we have something to ingest
    if not request.items and not request.accounts and not request.keywords:
        raise HTTPException(
            status_code=400,
            detail="Must provide at least one of: items, accounts, or keywords"
        )
    
    # Generate job ID
    job_id = str(uuid4())
    accepted_at = datetime.utcnow().isoformat()
    
    # Map priority to numeric value for Celery
    priority_map = {"low": 1, "normal": 5, "high": 10}
    priority_value = priority_map.get(request.priority, 5)
    
    # Prepare job payload
    job_data = {
        "job_id": job_id,
        "source_type": request.source_type,
        "items": [item.model_dump() for item in request.items] if request.items else None,
        "accounts": request.accounts,
        "keywords": request.keywords,
        "date_range": request.date_range.model_dump() if request.date_range else None,
        "mode": request.mode,
        "tenant": request.tenant,
        "priority": request.priority,
        "accepted_at": accepted_at,
    }
    
    # Enqueue to Celery (with retry support)
    try:
        process_ingestion_job.apply_async(
            args=[job_data],
            task_id=job_id,
            priority=priority_value,
            retry=True,
            retry_policy={
                'max_retries': 3,
                'interval_start': 10,
                'interval_step': 30,
                'interval_max': 300,
            }
        )
    except Exception as e:
        # If Celery is unavailable, process synchronously in development
        from app.config import settings
        if settings.debug:
            background_tasks.add_task(process_ingestion_job, job_data)
        else:
            raise HTTPException(
                status_code=503,
                detail="Job queue unavailable. Please try again later."
            )
    
    return IngestResponse(
        job_id=job_id,
        accepted_at=accepted_at,
        status="queued",
        message=f"Ingestion job queued with priority: {request.priority}"
    )


@router.post("/batch", response_model=List[IngestResponse], status_code=201)
async def submit_batch_ingestion(
    requests: List[IngestRequest],
    background_tasks: BackgroundTasks,
    api_key: str = Depends(verify_api_key),
):
    """
    Submit multiple ingestion jobs in a single request.
    
    Useful for bulk historical imports or scheduled batch processing.
    """
    if len(requests) > 100:
        raise HTTPException(
            status_code=400,
            detail="Maximum 100 jobs per batch request"
        )
    
    responses = []
    for req in requests:
        # Recursively call single submission
        response = await submit_ingestion_job(req, background_tasks, api_key)
        responses.append(response)
    
    return responses
