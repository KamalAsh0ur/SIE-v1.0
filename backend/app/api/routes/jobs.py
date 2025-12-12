"""
Jobs Endpoints

GET /jobs - List all jobs with filtering
GET /jobs/{job_id} - Get specific job status
"""

from datetime import datetime
from typing import Optional, List
from enum import Enum

from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel

from app.api.deps import verify_api_key, get_db


router = APIRouter()


# ============================================================================
# Enums and Models
# ============================================================================

class JobStatus(str, Enum):
    """Job processing status."""
    PENDING = "pending"
    INGESTING = "ingesting"
    PROCESSING = "processing"
    ENRICHING = "enriching"
    COMPLETED = "completed"
    FAILED = "failed"
    PARTIAL = "partial"


class JobPriority(str, Enum):
    """Job priority level."""
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"


class JobSummary(BaseModel):
    """Brief job summary for list views."""
    job_id: str
    tenant: str
    source_type: str
    status: JobStatus
    priority: JobPriority
    items_total: int
    items_processed: int
    created_at: str
    updated_at: str
    error_message: Optional[str] = None


class JobDetail(BaseModel):
    """Detailed job information including processing stats."""
    job_id: str
    tenant: str
    source_type: str
    status: JobStatus
    priority: JobPriority
    mode: str
    
    # Progress
    items_total: int
    items_processed: int
    items_success: int
    items_failed: int
    progress_percent: float
    
    # Timestamps
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    updated_at: str
    
    # Processing details
    accounts: Optional[List[str]] = None
    keywords: Optional[List[str]] = None
    error_message: Optional[str] = None
    retry_count: int = 0
    
    # Metrics
    processing_time_ms: Optional[int] = None


class JobListResponse(BaseModel):
    """Paginated job list response."""
    jobs: List[JobSummary]
    pagination: dict


class JobStatusResponse(BaseModel):
    """Job status response for polling."""
    job_id: str
    status: JobStatus
    progress_percent: float
    items_processed: int
    items_total: int
    estimated_time_remaining: Optional[int] = None


# ============================================================================
# Mock Data (Replace with database queries)
# ============================================================================

# Temporary in-memory storage for demo
_mock_jobs: dict = {}


def get_mock_job(job_id: str) -> Optional[dict]:
    """Get mock job data."""
    return _mock_jobs.get(job_id)


def create_mock_job(job_id: str, data: dict):
    """Store mock job data."""
    _mock_jobs[job_id] = {
        "job_id": job_id,
        "tenant": data.get("tenant", "default"),
        "source_type": data.get("source_type", "scraped"),
        "status": JobStatus.PENDING,
        "priority": data.get("priority", "normal"),
        "mode": data.get("mode", "realtime"),
        "items_total": len(data.get("items", []) or []),
        "items_processed": 0,
        "items_success": 0,
        "items_failed": 0,
        "progress_percent": 0.0,
        "created_at": data.get("accepted_at", datetime.utcnow().isoformat()),
        "started_at": None,
        "completed_at": None,
        "updated_at": datetime.utcnow().isoformat(),
        "accounts": data.get("accounts"),
        "keywords": data.get("keywords"),
        "error_message": None,
        "retry_count": 0,
        "processing_time_ms": None,
    }


# ============================================================================
# API Endpoints
# ============================================================================

@router.get("", response_model=JobListResponse)
async def list_jobs(
    tenant: Optional[str] = Query(None, description="Filter by tenant"),
    status: Optional[JobStatus] = Query(None, description="Filter by status"),
    source_type: Optional[str] = Query(None, description="Filter by source type"),
    priority: Optional[JobPriority] = Query(None, description="Filter by priority"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    api_key: str = Depends(verify_api_key),
):
    """
    List all ingestion jobs with optional filtering.
    
    Supports pagination and filtering by tenant, status, source type, and priority.
    """
    offset = (page - 1) * limit
    
    # Try database first
    try:
        from app.db.service import get_db_service
        db = await get_db_service()
        jobs, total = await db.list_jobs(
            tenant=tenant,
            status=status.value if status else None,
            limit=limit,
            offset=offset,
        )
        
        if jobs:
            # Convert database rows to summaries
            job_summaries = [
                JobSummary(
                    job_id=str(j.get("id", j.get("job_id", ""))),
                    tenant=j.get("tenant", ""),
                    source_type=j.get("source_type", "scraped"),
                    status=JobStatus(j.get("status", "pending")),
                    priority=JobPriority(j.get("priority", "normal")),
                    items_total=j.get("items_total", 0),
                    items_processed=j.get("items_processed", 0),
                    created_at=str(j.get("created_at", "")),
                    updated_at=str(j.get("updated_at", "")),
                    error_message=j.get("error_message"),
                )
                for j in jobs
            ]
            
            return JobListResponse(
                jobs=job_summaries,
                pagination={
                    "page": page,
                    "limit": limit,
                    "total": total,
                    "total_pages": (total + limit - 1) // limit if total > 0 else 0,
                }
            )
    except Exception as e:
        print(f"Database query failed, using in-memory: {e}")
    
    # Fallback to in-memory storage
    filtered_jobs = list(_mock_jobs.values())
    
    if tenant:
        filtered_jobs = [j for j in filtered_jobs if j["tenant"] == tenant]
    if status:
        filtered_jobs = [j for j in filtered_jobs if j["status"] == status]
    if source_type:
        filtered_jobs = [j for j in filtered_jobs if j["source_type"] == source_type]
    if priority:
        filtered_jobs = [j for j in filtered_jobs if j["priority"] == priority]
    
    # Sort by created_at descending
    filtered_jobs.sort(key=lambda x: x["created_at"], reverse=True)
    
    # Paginate
    total = len(filtered_jobs)
    start = (page - 1) * limit
    end = start + limit
    paginated_jobs = filtered_jobs[start:end]
    
    # Convert to summary models
    job_summaries = [
        JobSummary(
            job_id=j["job_id"],
            tenant=j["tenant"],
            source_type=j["source_type"],
            status=j["status"],
            priority=j["priority"],
            items_total=j["items_total"],
            items_processed=j["items_processed"],
            created_at=j["created_at"],
            updated_at=j["updated_at"],
            error_message=j.get("error_message"),
        )
        for j in paginated_jobs
    ]
    
    return JobListResponse(
        jobs=job_summaries,
        pagination={
            "page": page,
            "limit": limit,
            "total": total,
            "total_pages": (total + limit - 1) // limit,
        }
    )


@router.get("/{job_id}", response_model=JobDetail)
async def get_job(
    job_id: str,
    api_key: str = Depends(verify_api_key),
):
    """
    Get detailed information about a specific job.
    
    Returns full job details including processing progress and metrics.
    """
    job = get_mock_job(job_id)
    
    if not job:
        raise HTTPException(
            status_code=404,
            detail=f"Job {job_id} not found"
        )
    
    return JobDetail(**job)


@router.get("/{job_id}/status", response_model=JobStatusResponse)
async def get_job_status(
    job_id: str,
    api_key: str = Depends(verify_api_key),
):
    """
    Get job status for polling.
    
    Lightweight endpoint for checking job progress without full details.
    """
    job = get_mock_job(job_id)
    
    if not job:
        raise HTTPException(
            status_code=404,
            detail=f"Job {job_id} not found"
        )
    
    # Estimate remaining time based on progress
    estimated_remaining = None
    if job["progress_percent"] > 0 and job["processing_time_ms"]:
        elapsed = job["processing_time_ms"]
        remaining_percent = 100 - job["progress_percent"]
        estimated_remaining = int((elapsed / job["progress_percent"]) * remaining_percent)
    
    return JobStatusResponse(
        job_id=job["job_id"],
        status=job["status"],
        progress_percent=job["progress_percent"],
        items_processed=job["items_processed"],
        items_total=job["items_total"],
        estimated_time_remaining=estimated_remaining,
    )


@router.delete("/{job_id}", status_code=204)
async def cancel_job(
    job_id: str,
    api_key: str = Depends(verify_api_key),
):
    """
    Cancel a pending or running job.
    
    Note: Already completed jobs cannot be cancelled.
    """
    job = get_mock_job(job_id)
    
    if not job:
        raise HTTPException(
            status_code=404,
            detail=f"Job {job_id} not found"
        )
    
    if job["status"] in [JobStatus.COMPLETED, JobStatus.FAILED]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel job with status: {job['status']}"
        )
    
    # Mark as cancelled (using failed status)
    job["status"] = JobStatus.FAILED
    job["error_message"] = "Cancelled by user"
    job["updated_at"] = datetime.utcnow().isoformat()
    
    # TODO: Actually revoke Celery task
    
    return None
