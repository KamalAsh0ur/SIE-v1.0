"""
Celery Tasks

Async task definitions for ingestion processing pipeline.
Implements the full processing pipeline per SRS §3.3.
"""

import time
from datetime import datetime
from typing import Optional, List
from uuid import uuid4

from celery import shared_task, chain, group
from celery.exceptions import MaxRetriesExceededError

from app.workers.celery_app import celery_app


# ============================================================================
# Main Ingestion Task
# ============================================================================

@celery_app.task(
    bind=True,
    name="app.workers.tasks.process_ingestion_job",
    max_retries=3,
    default_retry_delay=60,
    acks_late=True,
)
def process_ingestion_job(self, job_data: dict):
    """
    Main ingestion job processing task.
    
    Orchestrates the full pipeline:
    1. Scrape content (if needed)
    2. Run NLP analysis
    3. Run OCR extraction
    4. Deduplicate
    5. Classify spam
    6. Normalize and store
    
    Args:
        job_data: Job payload from /ingest endpoint
    """
    job_id = job_data["job_id"]
    tenant = job_data["tenant"]
    
    print(f"[{job_id}] Starting ingestion job processing")
    start_time = time.time()
    
    try:
        # Update job status to processing
        update_job_status(job_id, "ingesting", 10)
        emit_event(job_id, tenant, "processing.started", {
            "stage": "ingesting",
            "message": "Starting content ingestion"
        })
        
        # Stage 1: Get content (scrape or use provided items)
        items = []
        if job_data.get("items"):
            # Items already provided from API
            items = job_data["items"]
            print(f"[{job_id}] Processing {len(items)} pre-fetched items")
        else:
            # Need to scrape content
            items = scrape_content(
                accounts=job_data.get("accounts", []),
                keywords=job_data.get("keywords", []),
                source_type=job_data["source_type"],
            )
            print(f"[{job_id}] Scraped {len(items)} items")
        
        update_job_status(job_id, "processing", 30, items_total=len(items))
        
        # Stage 2: Process each item through NLP + OCR pipeline
        processed_items = []
        for i, item in enumerate(items):
            try:
                # NLP Analysis
                nlp_result = run_nlp_analysis(item.get("content", ""))
                
                # OCR if media present
                ocr_text = None
                if item.get("media"):
                    ocr_result = run_ocr_extraction(item["media"])
                    ocr_text = ocr_result.get("text")
                
                # Combine results
                processed_item = {
                    **item,
                    "nlp": nlp_result,
                    "ocr_text": ocr_text,
                }
                processed_items.append(processed_item)
                
                # Update progress
                progress = 30 + int((i + 1) / len(items) * 50)
                update_job_status(job_id, "processing", progress, items_processed=i+1)
                
            except Exception as e:
                print(f"[{job_id}] Error processing item {i}: {e}")
                continue
        
        # Stage 3: Enrichment (deduplication, spam classification)
        update_job_status(job_id, "enriching", 80)
        emit_event(job_id, tenant, "nlp.completed", {
            "items_processed": len(processed_items)
        })
        
        # Deduplicate
        deduplicated_items = deduplicate_items(processed_items)
        print(f"[{job_id}] After dedup: {len(deduplicated_items)} items")
        
        # Spam classification
        for item in deduplicated_items:
            item["is_spam"] = classify_spam(item.get("content", ""))
        
        # Stage 4: Normalize and store
        update_job_status(job_id, "enriching", 90)
        
        insights = normalize_and_store(job_id, tenant, deduplicated_items)
        print(f"[{job_id}] Stored {len(insights)} insights")
        
        # Complete
        elapsed = int((time.time() - start_time) * 1000)
        update_job_status(
            job_id, 
            "completed", 
            100,
            items_processed=len(deduplicated_items),
            processing_time_ms=elapsed,
        )
        
        emit_event(job_id, tenant, "complete", {
            "insights_count": len(insights),
            "processing_time_ms": elapsed,
        })
        
        print(f"[{job_id}] Job completed in {elapsed}ms")
        return {"success": True, "insights_count": len(insights)}
        
    except Exception as e:
        print(f"[{job_id}] Job failed: {e}")
        
        # Update job status to failed
        update_job_status(job_id, "failed", error_message=str(e))
        emit_event(job_id, tenant, "error", {
            "error": str(e),
        })
        
        # Retry if possible
        try:
            raise self.retry(exc=e)
        except MaxRetriesExceededError:
            print(f"[{job_id}] Max retries exceeded")
            raise


# ============================================================================
# Sub-tasks
# ============================================================================

@celery_app.task(name="app.workers.tasks.run_nlp_analysis")
def run_nlp_analysis(content: str) -> dict:
    """
    Run NLP analysis on content.
    
    Uses spaCy, VADER, and DistilBERT per SRS §5.2.
    """
    from app.services.nlp_service import NLPService
    
    nlp_service = NLPService()
    return nlp_service.analyze(content)


@celery_app.task(name="app.workers.tasks.run_ocr_extraction")
def run_ocr_extraction(media_urls: List[str]) -> dict:
    """
    Run OCR on images.
    
    Uses EasyOCR per SRS §5.3.
    """
    from app.services.ocr_service import OCRService
    
    ocr_service = OCRService()
    return ocr_service.extract_text(media_urls)


# ============================================================================
# Helper Functions
# ============================================================================

def scrape_content(accounts: List[str], keywords: List[str], source_type: str) -> List[dict]:
    """
    Scrape content from sources.
    
    Uses the scraper service per SRS §3.2.
    """
    import asyncio
    from app.services.scraper_service import get_scraper_service, get_social_scraper
    
    scraper = get_scraper_service()
    social_scraper = get_social_scraper()
    
    print(f"Scraping: accounts={accounts}, keywords={keywords}, source={source_type}")
    
    items = []
    
    # Get or create event loop
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    
    # Scrape accounts (treat as URLs or social handles)
    for account in accounts:
        try:
            if account.startswith('http'):
                # It's a URL - scrape it directly
                result = loop.run_until_complete(scraper.scrape_urls([account]))
                items.extend(result)
            elif account.startswith('r/'):
                # Reddit subreddit
                subreddit = account[2:]
                result = loop.run_until_complete(social_scraper.scrape_reddit_subreddit(subreddit))
                items.extend(result)
            elif account.startswith('@'):
                # Social media handle - currently limited support
                print(f"⚠ Social handle scraping limited: {account}")
            else:
                # Try as URL
                result = loop.run_until_complete(scraper.scrape_urls([account]))
                items.extend(result)
        except Exception as e:
            print(f"⚠ Failed to scrape {account}: {e}")
    
    # For keywords, we could implement search functionality
    if keywords and not accounts:
        print(f"⚠ Keyword-only scraping not yet implemented: {keywords}")
    
    return items


def deduplicate_items(items: List[dict]) -> List[dict]:
    """
    Remove duplicate items based on content hash.
    """
    seen = set()
    unique = []
    
    for item in items:
        content = item.get("content", "")
        # Simple hash-based dedup
        content_hash = hash(content[:500])  # First 500 chars
        
        if content_hash not in seen:
            seen.add(content_hash)
            item["is_duplicate"] = False
            unique.append(item)
        else:
            item["is_duplicate"] = True
            unique.append(item)
    
    return unique


def classify_spam(content: str) -> bool:
    """
    Classify content as spam or not.
    
    TODO: Implement proper spam classifier.
    """
    spam_indicators = [
        "buy now", "click here", "limited offer", "act now",
        "free money", "winner", "congratulations",
    ]
    content_lower = content.lower()
    return any(indicator in content_lower for indicator in spam_indicators)


def normalize_and_store(job_id: str, tenant: str, items: List[dict]) -> List[dict]:
    """
    Normalize processed items and store as insights.
    
    Creates canonical NormalizedPost records.
    """
    from app.api.routes.insights import store_insight, NormalizedPost, Provenance, ConfidenceScores, Entity
    
    insights = []
    now = datetime.utcnow().isoformat()
    
    for item in items:
        nlp = item.get("nlp", {})
        
        # Create normalized post
        insight = NormalizedPost(
            post_id=item.get("id") or str(uuid4()),
            job_id=job_id,
            tenant=tenant,
            
            # Content
            content_text=item.get("content", ""),
            ocr_text=item.get("ocr_text"),
            
            # NLP results
            sentiment=nlp.get("sentiment", {}).get("type", "neutral"),
            sentiment_score=nlp.get("sentiment", {}).get("score", 0.0),
            entities=[
                Entity(type=e["type"], name=e["name"], confidence=e.get("confidence", 0.8))
                for e in nlp.get("entities", [])
            ],
            topics=nlp.get("topics", []),
            keywords=nlp.get("keywords", []),
            language=nlp.get("language", {}).get("code", "en"),
            
            # Metadata
            author=item.get("author"),
            published_at=item.get("timestamp"),
            
            # Provenance
            provenance=Provenance(
                source_url=item.get("url", ""),
                platform=item.get("platform", "unknown"),
                fetch_method=item.get("fetch_method", "api"),
                fetched_at=now,
                original_id=item.get("id"),
            ),
            
            # Quality
            confidence_scores=ConfidenceScores(
                sentiment=nlp.get("sentiment", {}).get("confidence", 0.8),
                language=nlp.get("language", {}).get("confidence", 0.9),
                topics=0.8,
                entities=0.8,
            ),
            is_spam=item.get("is_spam", False),
            is_duplicate=item.get("is_duplicate", False),
            
            # Timestamps
            created_at=now,
            processed_at=now,
        )
        
        store_insight(job_id, insight)
        insights.append(insight.model_dump())
    
    return insights


def update_job_status(
    job_id: str, 
    status: str, 
    progress: int = 0,
    items_total: int = None,
    items_processed: int = None,
    processing_time_ms: int = None,
    error_message: str = None,
):
    """Update job status in storage."""
    from app.api.routes.jobs import _mock_jobs, JobStatus
    
    if job_id in _mock_jobs:
        job = _mock_jobs[job_id]
        job["status"] = JobStatus(status)
        job["progress_percent"] = progress
        job["updated_at"] = datetime.utcnow().isoformat()
        
        if items_total is not None:
            job["items_total"] = items_total
        if items_processed is not None:
            job["items_processed"] = items_processed
        if processing_time_ms is not None:
            job["processing_time_ms"] = processing_time_ms
        if error_message is not None:
            job["error_message"] = error_message
        
        if status == "ingesting":
            job["started_at"] = datetime.utcnow().isoformat()
        elif status in ["completed", "failed"]:
            job["completed_at"] = datetime.utcnow().isoformat()


def emit_event(job_id: str, tenant: str, event_type: str, data: dict = None):
    """Emit event for SSE streaming."""
    import asyncio
    from app.api.routes.events import publish_event, JobEvent, EventType
    
    try:
        # Get or create event loop
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    
    event = JobEvent(
        event_type=EventType(event_type) if event_type in [e.value for e in EventType] else EventType.PARTIAL_RESULT,
        job_id=job_id,
        tenant=tenant,
        timestamp=datetime.utcnow().isoformat(),
        data=data,
    )
    
    # Run async publish
    try:
        loop.run_until_complete(publish_event(event))
    except Exception as e:
        print(f"Failed to emit event: {e}")
