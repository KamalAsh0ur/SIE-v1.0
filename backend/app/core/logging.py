"""
Structured Logging Configuration

JSON-formatted logs with request IDs and job tracing.
Implements SRS §6.1 requirements.
"""

import logging
import sys
import uuid
from contextvars import ContextVar
from datetime import datetime
from typing import Optional

import structlog
from structlog.types import Processor


# Context variables for request/job tracing
request_id_var: ContextVar[str] = ContextVar("request_id", default="")
job_id_var: ContextVar[str] = ContextVar("job_id", default="")
tenant_var: ContextVar[str] = ContextVar("tenant", default="")


def get_request_id() -> str:
    """Get current request ID from context."""
    return request_id_var.get() or str(uuid.uuid4())[:8]


def get_job_id() -> str:
    """Get current job ID from context."""
    return job_id_var.get()


def set_request_context(request_id: str, tenant: str = ""):
    """Set request context for logging."""
    request_id_var.set(request_id)
    tenant_var.set(tenant)


def set_job_context(job_id: str, tenant: str = ""):
    """Set job context for logging."""
    job_id_var.set(job_id)
    tenant_var.set(tenant)


def add_context_info(
    logger: logging.Logger,
    method_name: str,
    event_dict: dict,
) -> dict:
    """Add context information to log entries."""
    event_dict["request_id"] = request_id_var.get()
    event_dict["job_id"] = job_id_var.get()
    event_dict["tenant"] = tenant_var.get()
    event_dict["timestamp"] = datetime.utcnow().isoformat() + "Z"
    event_dict["service"] = "sie-backend"
    return event_dict


def configure_logging(
    level: str = "INFO",
    json_format: bool = True,
    development: bool = False,
):
    """
    Configure structured logging for the application.
    
    Args:
        level: Log level (DEBUG, INFO, WARNING, ERROR)
        json_format: Use JSON output format
        development: Use human-readable format for development
    """
    timestamper = structlog.processors.TimeStamper(fmt="iso")
    
    shared_processors: list[Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.PositionalArgumentsFormatter(),
        timestamper,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        add_context_info,
    ]
    
    if development:
        # Human-readable format for development
        renderer = structlog.dev.ConsoleRenderer(colors=True)
    else:
        # JSON format for production
        renderer = structlog.processors.JSONRenderer()
    
    structlog.configure(
        processors=shared_processors + [
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )
    
    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
    )
    
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)
    
    root_logger = logging.getLogger()
    root_logger.handlers = []
    root_logger.addHandler(handler)
    root_logger.setLevel(getattr(logging, level.upper()))
    
    # Set levels for noisy libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)


def get_logger(name: str = __name__) -> structlog.stdlib.BoundLogger:
    """Get a structured logger instance."""
    return structlog.get_logger(name)


# ============================================================================
# Log Helper Functions
# ============================================================================

def log_request(method: str, path: str, status_code: int, duration_ms: float):
    """Log HTTP request."""
    logger = get_logger("http")
    logger.info(
        "http_request",
        method=method,
        path=path,
        status_code=status_code,
        duration_ms=round(duration_ms, 2),
    )


def log_job_event(job_id: str, event: str, **kwargs):
    """Log job processing event."""
    logger = get_logger("job")
    set_job_context(job_id)
    logger.info(
        f"job_{event}",
        job_id=job_id,
        **kwargs,
    )


def log_nlp_result(job_id: str, item_id: str, duration_ms: float, sentiment: str):
    """Log NLP processing result."""
    logger = get_logger("nlp")
    logger.info(
        "nlp_processed",
        job_id=job_id,
        item_id=item_id,
        duration_ms=round(duration_ms, 2),
        sentiment=sentiment,
    )


def log_ocr_result(job_id: str, image_url: str, duration_ms: float, confidence: float):
    """Log OCR processing result."""
    logger = get_logger("ocr")
    logger.info(
        "ocr_processed",
        job_id=job_id,
        image_url=image_url[:100],  # Truncate long URLs
        duration_ms=round(duration_ms, 2),
        confidence=round(confidence, 3),
    )


def log_scraper_result(url: str, status: str, items_count: int, duration_ms: float):
    """Log scraper result."""
    logger = get_logger("scraper")
    logger.info(
        "scraper_completed",
        url=url[:100],
        status=status,
        items_count=items_count,
        duration_ms=round(duration_ms, 2),
    )


def log_error(error: Exception, context: str = "", **kwargs):
    """Log error with stack trace."""
    logger = get_logger("error")
    logger.error(
        "error_occurred",
        error_type=type(error).__name__,
        error_message=str(error),
        context=context,
        **kwargs,
        exc_info=error,
    )


def log_dlq_entry(job_id: str, error: str, attempts: int):
    """Log DLQ entry."""
    logger = get_logger("dlq")
    logger.warning(
        "job_to_dlq",
        job_id=job_id,
        error=error,
        attempts=attempts,
    )
