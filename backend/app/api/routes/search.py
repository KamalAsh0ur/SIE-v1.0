"""
Search API Endpoints

Full-text search for insights using Meilisearch.
"""

from typing import Optional, List

from fastapi import APIRouter, Query, Depends
from pydantic import BaseModel

from app.api.deps import verify_api_key
from app.services.search_service import get_meilisearch_service


router = APIRouter()


class SearchResult(BaseModel):
    """Search result item."""
    post_id: str
    job_id: str
    content_text: str
    sentiment_type: Optional[str]
    sentiment_score: Optional[float]
    topics: Optional[List[str]]
    platform: Optional[str]
    language: Optional[str]
    created_at: Optional[str]
    _formatted: Optional[dict] = None  # Highlighted content


class SearchResponse(BaseModel):
    """Search response."""
    hits: List[dict]
    total: int
    processing_time_ms: int
    query: str


@router.get("", response_model=SearchResponse)
async def search_insights(
    q: str = Query(..., min_length=1, description="Search query"),
    tenant: Optional[str] = Query(None, description="Filter by tenant"),
    sentiment: Optional[str] = Query(None, description="Filter by sentiment"),
    platform: Optional[str] = Query(None, description="Filter by platform"),
    language: Optional[str] = Query(None, description="Filter by language"),
    exclude_spam: bool = Query(True, description="Exclude spam"),
    sort: Optional[str] = Query(None, description="Sort field (e.g., created_at:desc)"),
    limit: int = Query(50, ge=1, le=100, description="Max results"),
    offset: int = Query(0, ge=0, description="Results offset"),
    api_key: str = Depends(verify_api_key),
):
    """
    Full-text search across insights.
    
    Search content, OCR text, topics, keywords, and entities.
    Results are ranked by relevance with optional sorting.
    """
    search_service = get_meilisearch_service()
    
    # Build filters
    filters = {}
    if sentiment:
        filters["sentiment_type"] = sentiment
    if platform:
        filters["platform"] = platform
    if language:
        filters["language"] = language
    if exclude_spam:
        filters["is_spam"] = False
    
    # Parse sort
    sort_list = [sort] if sort else None
    
    result = await search_service.search(
        query=q,
        tenant=tenant,
        filters=filters,
        sort=sort_list,
        limit=limit,
        offset=offset,
    )
    
    return SearchResponse(
        hits=result.get("hits", []),
        total=result.get("total", 0),
        processing_time_ms=result.get("processing_time_ms", 0),
        query=q,
    )


@router.get("/stats")
async def get_search_stats(
    api_key: str = Depends(verify_api_key),
):
    """
    Get search index statistics.
    """
    search_service = get_meilisearch_service()
    stats = await search_service.get_stats()
    return stats
