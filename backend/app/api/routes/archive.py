"""
Archive API Endpoints

Endpoints for managing cold storage archives.
"""

from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Query, Depends, HTTPException
from pydantic import BaseModel

from app.api.deps import verify_api_key


router = APIRouter()


class ArchiveJobRequest(BaseModel):
    """Request to archive a job's insights."""
    job_id: str
    tenant: str
    compress: bool = True


class ArchiveResponse(BaseModel):
    """Archive operation response."""
    archived: bool
    key: Optional[str] = None
    size_bytes: Optional[int] = None
    compressed: bool = False
    timestamp: Optional[str] = None
    message: Optional[str] = None


@router.post("/archive", response_model=ArchiveResponse)
async def archive_job_insights(
    request: ArchiveJobRequest,
    api_key: str = Depends(verify_api_key),
):
    """
    Archive a job's insights to cold storage.
    
    Moves insights from hot storage (PostgreSQL) to cold storage (R2/B2).
    """
    try:
        from app.services.archive_service import get_archive_service
        archive_service = get_archive_service()
        
        # In a real implementation, fetch insights from database
        # For now, return a placeholder response
        return ArchiveResponse(
            archived=False,
            message="Archive endpoint ready. Connect to database to fetch insights.",
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/archives")
async def list_archives(
    tenant: str = Query(..., description="Tenant ID"),
    prefix: str = Query("", description="Key prefix filter"),
    limit: int = Query(100, ge=1, le=1000),
    api_key: str = Depends(verify_api_key),
):
    """
    List archived files for a tenant.
    """
    try:
        from app.services.archive_service import get_archive_service
        archive_service = get_archive_service()
        
        archives = await archive_service.list_archives(
            tenant=tenant,
            prefix=prefix,
            max_results=limit,
        )
        
        return {"archives": archives, "count": len(archives)}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/archives/{key:path}")
async def retrieve_archive(
    key: str,
    api_key: str = Depends(verify_api_key),
):
    """
    Retrieve archived insights.
    """
    try:
        from app.services.archive_service import get_archive_service
        archive_service = get_archive_service()
        
        insights = await archive_service.retrieve_archive(key)
        
        return {"key": key, "insights": insights, "count": len(insights)}
        
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Archive not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/archives/{key:path}")
async def delete_archive(
    key: str,
    api_key: str = Depends(verify_api_key),
):
    """
    Delete an archived file.
    """
    try:
        from app.services.archive_service import get_archive_service
        archive_service = get_archive_service()
        
        success = await archive_service.delete_archive(key)
        
        if success:
            return {"deleted": True, "key": key}
        else:
            raise HTTPException(status_code=500, detail="Failed to delete archive")
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/retention/stats")
async def get_retention_stats(
    api_key: str = Depends(verify_api_key),
):
    """
    Get retention policy statistics.
    """
    try:
        from app.services.archive_service import get_retention_policy
        policy = get_retention_policy()
        
        return {
            "hot_retention_days": policy.hot_retention_days,
            "cold_retention_days": policy.cold_retention_days,
            "archive_cutoff": policy.get_archive_cutoff().isoformat(),
            "delete_cutoff": policy.get_delete_cutoff().isoformat(),
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
