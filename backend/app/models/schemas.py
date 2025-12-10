"""
Pydantic Schemas

Request/response schemas for API validation.
Re-exports from route modules for convenience.
"""

from app.api.routes.ingest import IngestRequest, IngestResponse, IngestItem, DateRange
from app.api.routes.jobs import JobSummary, JobDetail, JobStatus, JobPriority
from app.api.routes.insights import (
    NormalizedPost, 
    Entity, 
    MediaMetadata, 
    Provenance, 
    ConfidenceScores,
    SentimentType,
    InsightsResponse,
    InsightsSummary,
)
from app.api.routes.events import JobEvent, EventType


__all__ = [
    # Ingest
    "IngestRequest",
    "IngestResponse", 
    "IngestItem",
    "DateRange",
    
    # Jobs
    "JobSummary",
    "JobDetail",
    "JobStatus",
    "JobPriority",
    
    # Insights
    "NormalizedPost",
    "Entity",
    "MediaMetadata",
    "Provenance",
    "ConfidenceScores",
    "SentimentType",
    "InsightsResponse",
    "InsightsSummary",
    
    # Events
    "JobEvent",
    "EventType",
]
