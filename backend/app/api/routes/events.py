"""
Event Streaming Endpoints

GET /events/stream - SSE event streaming for real-time job updates.
Implements SRS §3.5 requirements.
"""

import asyncio
import json
from datetime import datetime
from typing import Optional, AsyncGenerator
from enum import Enum

from fastapi import APIRouter, Query, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.api.deps import verify_api_key


router = APIRouter()


# ============================================================================
# Event Models (SRS §3.5)
# ============================================================================

class EventType(str, Enum):
    """Event types per SRS §3.5."""
    JOB_ACCEPTED = "job.accepted"
    PARTIAL_RESULT = "partial_result"
    COMPLETE = "complete"
    ERROR = "error"
    # Additional event types for detailed tracking
    PROCESSING_STARTED = "processing.started"
    NLP_STARTED = "nlp.started"
    NLP_COMPLETED = "nlp.completed"
    OCR_STARTED = "ocr.started"
    OCR_COMPLETED = "ocr.completed"
    ITEM_PROCESSED = "item.processed"


class JobEvent(BaseModel):
    """Event payload for SSE streaming."""
    event_type: EventType
    job_id: str
    tenant: str
    timestamp: str
    data: Optional[dict] = None
    message: Optional[str] = None


# ============================================================================
# In-Memory Event Queue (Replace with Redis Pub/Sub in production)
# ============================================================================

_event_subscribers: dict = {}  # job_id -> list of queues
_global_subscribers: list = []  # Subscribers for all events


async def publish_event(event: JobEvent):
    """Publish an event to all subscribers."""
    event_json = event.model_dump_json()
    
    # Notify job-specific subscribers
    if event.job_id in _event_subscribers:
        for queue in _event_subscribers[event.job_id]:
            await queue.put(event_json)
    
    # Notify global subscribers
    for queue in _global_subscribers:
        await queue.put(event_json)


async def subscribe_to_job(job_id: str) -> asyncio.Queue:
    """Subscribe to events for a specific job."""
    queue = asyncio.Queue()
    if job_id not in _event_subscribers:
        _event_subscribers[job_id] = []
    _event_subscribers[job_id].append(queue)
    return queue


def unsubscribe_from_job(job_id: str, queue: asyncio.Queue):
    """Unsubscribe from job events."""
    if job_id in _event_subscribers and queue in _event_subscribers[job_id]:
        _event_subscribers[job_id].remove(queue)


async def subscribe_global() -> asyncio.Queue:
    """Subscribe to all events."""
    queue = asyncio.Queue()
    _global_subscribers.append(queue)
    return queue


def unsubscribe_global(queue: asyncio.Queue):
    """Unsubscribe from global events."""
    if queue in _global_subscribers:
        _global_subscribers.remove(queue)


def cleanup_empty_subscriptions():
    """Clean up job subscriptions with no queues to prevent memory leaks."""
    empty_jobs = [job_id for job_id, queues in _event_subscribers.items() if not queues]
    for job_id in empty_jobs:
        del _event_subscribers[job_id]


def cleanup_all_subscribers():
    """Clean up all subscribers on shutdown."""
    _event_subscribers.clear()
    _global_subscribers.clear()
    print("✓ Event subscribers cleaned up")


# ============================================================================
# SSE Generator
# ============================================================================

async def event_generator(
    queue: asyncio.Queue,
    request: Request,
    heartbeat_interval: int = 15,
) -> AsyncGenerator[str, None]:
    """
    Generate SSE events from queue.
    
    Sends heartbeats to keep connection alive and detects client disconnect.
    """
    try:
        while True:
            # Check if client disconnected
            if await request.is_disconnected():
                break
            
            try:
                # Wait for event with timeout for heartbeat
                event_data = await asyncio.wait_for(
                    queue.get(),
                    timeout=heartbeat_interval
                )
                
                # Parse event to get type
                event_obj = json.loads(event_data)
                event_type = event_obj.get("event_type", "message")
                
                # Format as SSE
                yield f"event: {event_type}\ndata: {event_data}\n\n"
                
            except asyncio.TimeoutError:
                # Send heartbeat comment to keep connection alive
                yield f": heartbeat {datetime.utcnow().isoformat()}\n\n"
                
    except asyncio.CancelledError:
        pass


# ============================================================================
# API Endpoints
# ============================================================================

@router.get("/stream")
async def stream_events(
    request: Request,
    job_id: Optional[str] = Query(None, description="Filter events by job ID"),
    tenant: Optional[str] = Query(None, description="Filter events by tenant"),
    api_key: str = Depends(verify_api_key),
):
    """
    Stream real-time job events via Server-Sent Events (SSE).
    
    **SRS §3.5 Event Types:**
    - `job.accepted` - Job queued for processing
    - `partial_result` - Intermediate processing results
    - `complete` - Job finished successfully
    - `error` - Job failed with error
    
    **Usage Example:**
    ```javascript
    const eventSource = new EventSource('/events/stream?job_id=xxx');
    eventSource.addEventListener('complete', (e) => {
      console.log('Job completed:', JSON.parse(e.data));
    });
    ```
    """
    # Subscribe to events
    if job_id:
        queue = await subscribe_to_job(job_id)
        cleanup = lambda: unsubscribe_from_job(job_id, queue)
    else:
        queue = await subscribe_global()
        cleanup = lambda: unsubscribe_global(queue)
    
    # Send initial connection event
    await queue.put(json.dumps({
        "event_type": "connected",
        "job_id": job_id or "*",
        "tenant": tenant or "*",
        "timestamp": datetime.utcnow().isoformat(),
        "message": "Connected to event stream",
    }))
    
    async def generate():
        try:
            async for event in event_generator(queue, request):
                yield event
        finally:
            cleanup()
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        }
    )


@router.get("/recent")
async def get_recent_events(
    job_id: Optional[str] = Query(None, description="Filter by job ID"),
    limit: int = Query(50, ge=1, le=100, description="Max events to return"),
    api_key: str = Depends(verify_api_key),
):
    """
    Get recent events (polling fallback).
    
    For clients that can't use SSE, this endpoint provides
    recent events that can be polled periodically.
    """
    # TODO: Implement actual event storage and retrieval
    return {
        "events": [],
        "message": "No recent events. Use /stream for real-time updates.",
    }


# ============================================================================
# Helper Functions for Publishing Events
# ============================================================================

async def emit_job_accepted(job_id: str, tenant: str, data: dict = None):
    """Emit job accepted event."""
    await publish_event(JobEvent(
        event_type=EventType.JOB_ACCEPTED,
        job_id=job_id,
        tenant=tenant,
        timestamp=datetime.utcnow().isoformat(),
        data=data,
        message="Ingestion job accepted and queued",
    ))


async def emit_partial_result(job_id: str, tenant: str, data: dict):
    """Emit partial result event."""
    await publish_event(JobEvent(
        event_type=EventType.PARTIAL_RESULT,
        job_id=job_id,
        tenant=tenant,
        timestamp=datetime.utcnow().isoformat(),
        data=data,
        message="Partial results available",
    ))


async def emit_complete(job_id: str, tenant: str, data: dict = None):
    """Emit job complete event."""
    await publish_event(JobEvent(
        event_type=EventType.COMPLETE,
        job_id=job_id,
        tenant=tenant,
        timestamp=datetime.utcnow().isoformat(),
        data=data,
        message="Ingestion job completed successfully",
    ))


async def emit_error(job_id: str, tenant: str, error: str, data: dict = None):
    """Emit error event."""
    await publish_event(JobEvent(
        event_type=EventType.ERROR,
        job_id=job_id,
        tenant=tenant,
        timestamp=datetime.utcnow().isoformat(),
        data=data,
        message=error,
    ))
