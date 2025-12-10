"""
Insights Endpoints

GET /insights/{job_id} - Retrieve processed insights for a job.
Implements SRS §3.4 requirements.
"""

from datetime import datetime
from typing import Optional, List
from enum import Enum

from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel

from app.api.deps import verify_api_key


router = APIRouter()


# ============================================================================
# Models (SRS §3.4 - Each normalized post must include...)
# ============================================================================

class SentimentType(str, Enum):
    """Sentiment classification."""
    POSITIVE = "positive"
    NEGATIVE = "negative"
    NEUTRAL = "neutral"
    MIXED = "mixed"


class Entity(BaseModel):
    """Extracted named entity."""
    type: str  # person, organization, location, product, etc.
    name: str
    confidence: float


class MediaMetadata(BaseModel):
    """Metadata about attached media."""
    type: str  # image, video, link
    url: Optional[str] = None
    thumbnail: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None


class Provenance(BaseModel):
    """Data provenance information."""
    source_url: str
    platform: str
    fetch_method: str  # api, scraper, webhook
    fetched_at: str
    original_id: Optional[str] = None


class ConfidenceScores(BaseModel):
    """Confidence scores for NLP predictions."""
    sentiment: float
    language: float
    topics: float
    entities: float
    spam: Optional[float] = None


class NormalizedPost(BaseModel):
    """
    Normalized post with all enrichments.
    
    Implements SRS §3.4 requirements for insight data.
    """
    # Core identifiers
    post_id: str
    job_id: str
    tenant: str
    
    # Content
    content_text: str
    ocr_text: Optional[str] = None
    
    # NLP Enrichments
    sentiment: SentimentType
    sentiment_score: float  # -1.0 to 1.0
    entities: List[Entity]
    topics: List[str]
    keywords: List[str]
    language: str
    
    # Metadata
    author: Optional[str] = None
    author_id: Optional[str] = None
    published_at: Optional[str] = None
    media: Optional[List[MediaMetadata]] = None
    
    # Provenance
    provenance: Provenance
    
    # Quality metrics
    confidence_scores: ConfidenceScores
    is_spam: bool = False
    is_duplicate: bool = False
    
    # Timestamps
    created_at: str
    processed_at: str


class Pagination(BaseModel):
    """Pagination metadata."""
    page: int
    limit: int
    total: int
    total_pages: int


class InsightsResponse(BaseModel):
    """
    Insights retrieval response.
    
    Implements SRS §3.4 response format.
    """
    results: List[NormalizedPost]
    pagination: Pagination
    job_status: str  # partial | complete | error


class InsightsSummary(BaseModel):
    """Aggregated insights summary."""
    total_posts: int
    sentiment_breakdown: dict
    top_topics: List[dict]
    top_entities: List[dict]
    languages: List[dict]
    spam_rate: float
    duplicate_rate: float


# ============================================================================
# Mock Data Storage
# ============================================================================

_mock_insights: dict = {}


def store_insight(job_id: str, insight: NormalizedPost):
    """Store an insight."""
    if job_id not in _mock_insights:
        _mock_insights[job_id] = []
    _mock_insights[job_id].append(insight.model_dump())


def get_insights_for_job(job_id: str) -> List[dict]:
    """Get all insights for a job."""
    return _mock_insights.get(job_id, [])


# ============================================================================
# API Endpoints
# ============================================================================

@router.get("/{job_id}", response_model=InsightsResponse)
async def get_insights(
    job_id: str,
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(50, ge=1, le=200, description="Items per page"),
    sentiment: Optional[SentimentType] = Query(None, description="Filter by sentiment"),
    topic: Optional[str] = Query(None, description="Filter by topic"),
    language: Optional[str] = Query(None, description="Filter by language"),
    exclude_spam: bool = Query(True, description="Exclude spam posts"),
    exclude_duplicates: bool = Query(True, description="Exclude duplicate posts"),
    api_key: str = Depends(verify_api_key),
):
    """
    Retrieve processed insights for a job.
    
    Returns normalized posts with all NLP enrichments including
    sentiment, entities, topics, and media metadata.
    
    **SRS §3.4 Requirements:**
    - Post ID, Content text, OCR text (optional)
    - Sentiment, Entities, Topics
    - Media metadata, Provenance
    - Confidence scores
    """
    # Get insights from storage
    all_insights = get_insights_for_job(job_id)
    
    # Determine job status
    from app.api.routes.jobs import get_mock_job, JobStatus
    job = get_mock_job(job_id)
    
    if not job and not all_insights:
        raise HTTPException(
            status_code=404,
            detail=f"No insights found for job {job_id}"
        )
    
    job_status = "complete"
    if job:
        if job["status"] == JobStatus.FAILED:
            job_status = "error"
        elif job["status"] not in [JobStatus.COMPLETED]:
            job_status = "partial"
    
    # Apply filters
    filtered = all_insights
    
    if sentiment:
        filtered = [i for i in filtered if i["sentiment"] == sentiment.value]
    if topic:
        filtered = [i for i in filtered if topic.lower() in [t.lower() for t in i.get("topics", [])]]
    if language:
        filtered = [i for i in filtered if i.get("language", "").lower() == language.lower()]
    if exclude_spam:
        filtered = [i for i in filtered if not i.get("is_spam", False)]
    if exclude_duplicates:
        filtered = [i for i in filtered if not i.get("is_duplicate", False)]
    
    # Paginate
    total = len(filtered)
    start = (page - 1) * limit
    end = start + limit
    paginated = filtered[start:end]
    
    return InsightsResponse(
        results=[NormalizedPost(**i) for i in paginated],
        pagination=Pagination(
            page=page,
            limit=limit,
            total=total,
            total_pages=(total + limit - 1) // limit if total > 0 else 0,
        ),
        job_status=job_status,
    )


@router.get("/{job_id}/summary", response_model=InsightsSummary)
async def get_insights_summary(
    job_id: str,
    api_key: str = Depends(verify_api_key),
):
    """
    Get aggregated summary of insights for a job.
    
    Provides sentiment breakdown, top topics/entities, and quality metrics.
    """
    all_insights = get_insights_for_job(job_id)
    
    if not all_insights:
        raise HTTPException(
            status_code=404,
            detail=f"No insights found for job {job_id}"
        )
    
    # Calculate sentiment breakdown
    sentiment_counts = {"positive": 0, "negative": 0, "neutral": 0, "mixed": 0}
    topic_counts = {}
    entity_counts = {}
    language_counts = {}
    spam_count = 0
    duplicate_count = 0
    
    for insight in all_insights:
        # Sentiment
        sentiment_counts[insight.get("sentiment", "neutral")] += 1
        
        # Topics
        for topic in insight.get("topics", []):
            topic_counts[topic] = topic_counts.get(topic, 0) + 1
        
        # Entities
        for entity in insight.get("entities", []):
            key = f"{entity['type']}:{entity['name']}"
            entity_counts[key] = entity_counts.get(key, 0) + 1
        
        # Languages
        lang = insight.get("language", "unknown")
        language_counts[lang] = language_counts.get(lang, 0) + 1
        
        # Quality
        if insight.get("is_spam"):
            spam_count += 1
        if insight.get("is_duplicate"):
            duplicate_count += 1
    
    total = len(all_insights)
    
    # Get top items
    top_topics = sorted(
        [{"topic": k, "count": v} for k, v in topic_counts.items()],
        key=lambda x: x["count"],
        reverse=True
    )[:10]
    
    top_entities = sorted(
        [{"entity": k, "count": v} for k, v in entity_counts.items()],
        key=lambda x: x["count"],
        reverse=True
    )[:10]
    
    languages = sorted(
        [{"language": k, "count": v} for k, v in language_counts.items()],
        key=lambda x: x["count"],
        reverse=True
    )
    
    return InsightsSummary(
        total_posts=total,
        sentiment_breakdown=sentiment_counts,
        top_topics=top_topics,
        top_entities=top_entities,
        languages=languages,
        spam_rate=spam_count / total if total > 0 else 0,
        duplicate_rate=duplicate_count / total if total > 0 else 0,
    )
