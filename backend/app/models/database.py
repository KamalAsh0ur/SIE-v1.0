"""
Database Models

SQLAlchemy models for the SIE database.
"""

from datetime import datetime
from typing import Optional, List
from uuid import uuid4

from sqlalchemy import Column, String, Integer, Float, Boolean, Text, DateTime, ForeignKey, Enum, ARRAY
from sqlalchemy.dialects.postgresql import UUID, JSONB, INET
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship

import enum


Base = declarative_base()


# ============================================================================
# Enums
# ============================================================================

class JobStatus(str, enum.Enum):
    PENDING = "pending"
    INGESTING = "ingesting"
    PROCESSING = "processing"
    ENRICHING = "enriching"
    COMPLETED = "completed"
    FAILED = "failed"


class PlatformType(str, enum.Enum):
    META_API = "meta_api"
    YOUTUBE_API = "youtube_api"
    SCRAPED = "scraped"
    TWITTER = "twitter"
    REDDIT = "reddit"
    LINKEDIN = "linkedin"
    INSTAGRAM = "instagram"
    CUSTOM = "custom"


class SentimentType(str, enum.Enum):
    POSITIVE = "positive"
    NEGATIVE = "negative"
    NEUTRAL = "neutral"
    MIXED = "mixed"


class JobPriority(str, enum.Enum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"


# ============================================================================
# Models
# ============================================================================

class IngestionJob(Base):
    """Ingestion job tracking."""
    
    __tablename__ = "ingestion_jobs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    tenant = Column(String(255), nullable=False, index=True)
    source_type = Column(Enum(PlatformType), nullable=False)
    status = Column(Enum(JobStatus), nullable=False, default=JobStatus.PENDING, index=True)
    priority = Column(Enum(JobPriority), nullable=False, default=JobPriority.NORMAL)
    mode = Column(String(50), nullable=False, default="realtime")
    
    # Request data
    accounts = Column(ARRAY(Text))
    keywords = Column(ARRAY(Text))
    date_range = Column(JSONB)
    
    # Progress tracking
    items_total = Column(Integer, default=0)
    items_processed = Column(Integer, default=0)
    items_success = Column(Integer, default=0)
    items_failed = Column(Integer, default=0)
    progress_percent = Column(Float, default=0)
    
    # Error handling
    error_message = Column(Text)
    retry_count = Column(Integer, default=0)
    
    # Metrics
    processing_time_ms = Column(Integer)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, index=True)
    started_at = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    insights = relationship("Insight", back_populates="job", cascade="all, delete-orphan")
    events = relationship("PipelineEvent", back_populates="job")


class Insight(Base):
    """Normalized post with NLP enrichments."""
    
    __tablename__ = "insights"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    job_id = Column(UUID(as_uuid=True), ForeignKey("ingestion_jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    tenant = Column(String(255), nullable=False, index=True)
    
    # Original post data
    post_id = Column(String(255))
    content_text = Column(Text, nullable=False)
    ocr_text = Column(Text)
    
    # Author info
    author_name = Column(String(255))
    author_id = Column(String(255))
    published_at = Column(DateTime(timezone=True))
    
    # NLP results
    sentiment = Column(Enum(SentimentType), nullable=False, default=SentimentType.NEUTRAL, index=True)
    sentiment_score = Column(Float)
    entities = Column(JSONB, default=list)
    topics = Column(ARRAY(Text), default=list)
    keywords = Column(ARRAY(Text), default=list)
    language = Column(String(10), default="en")
    
    # Provenance
    source_url = Column(Text)
    platform = Column(String(50))
    fetch_method = Column(String(50))
    original_id = Column(String(255))
    
    # Quality
    confidence_scores = Column(JSONB, default=dict)
    is_spam = Column(Boolean, default=False)
    is_duplicate = Column(Boolean, default=False)
    
    # Media
    media = Column(JSONB, default=list)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, index=True)
    processed_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    
    # Relationships
    job = relationship("IngestionJob", back_populates="insights")


class PipelineEvent(Base):
    """Real-time pipeline events."""
    
    __tablename__ = "pipeline_events"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    job_id = Column(UUID(as_uuid=True), ForeignKey("ingestion_jobs.id", ondelete="SET NULL"), index=True)
    tenant = Column(String(255))
    
    event_type = Column(String(100), nullable=False)
    message = Column(Text)
    data = Column(JSONB, default=dict)
    
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, index=True)
    
    # Relationships
    job = relationship("IngestionJob", back_populates="events")


class ApiClient(Base):
    """API client for authentication."""
    
    __tablename__ = "api_clients"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String(255), nullable=False)
    api_key = Column(String(255), nullable=False, unique=True, index=True)
    tenant = Column(String(255), nullable=False)
    
    description = Column(Text)
    is_active = Column(Boolean, default=True)
    rate_limit_per_minute = Column(Integer, default=60)
    allowed_endpoints = Column(ARRAY(Text), default=lambda: ["*"])
    webhook_url = Column(Text)
    
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    usage_logs = relationship("ApiUsageLog", back_populates="client")


class ApiUsageLog(Base):
    """API usage tracking."""
    
    __tablename__ = "api_usage_logs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    client_id = Column(UUID(as_uuid=True), ForeignKey("api_clients.id", ondelete="SET NULL"), index=True)
    
    endpoint = Column(String(255), nullable=False)
    method = Column(String(10), nullable=False)
    status_code = Column(Integer)
    response_time_ms = Column(Integer)
    ip_address = Column(INET)
    
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, index=True)
    
    # Relationships
    client = relationship("ApiClient", back_populates="usage_logs")
