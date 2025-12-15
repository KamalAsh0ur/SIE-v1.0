"""
Prometheus Metrics

Exposes metrics for monitoring the SIE backend.
Implements observability requirements.
"""

from prometheus_client import Counter, Histogram, Gauge, Info
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
from fastapi import APIRouter, Response


router = APIRouter()


# ============================================================================
# Metrics Definitions
# ============================================================================

# Service info
SERVICE_INFO = Info(
    "sie_service",
    "SIE service information"
)

# HTTP metrics
HTTP_REQUESTS = Counter(
    "sie_http_requests_total",
    "Total HTTP requests",
    ["method", "endpoint", "status"]
)

HTTP_REQUEST_DURATION = Histogram(
    "sie_http_request_duration_seconds",
    "HTTP request duration in seconds",
    ["method", "endpoint"],
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]
)

# Job metrics
JOBS_SUBMITTED = Counter(
    "sie_jobs_submitted_total",
    "Total jobs submitted",
    ["source_type", "priority"]
)

JOBS_COMPLETED = Counter(
    "sie_jobs_completed_total",
    "Total jobs completed",
    ["status"]  # completed, failed
)

JOBS_IN_PROGRESS = Gauge(
    "sie_jobs_in_progress",
    "Jobs currently being processed"
)

JOB_DURATION = Histogram(
    "sie_job_duration_seconds",
    "Job processing duration in seconds",
    ["source_type"],
    buckets=[1, 5, 10, 30, 60, 120, 300, 600]
)

# Queue metrics
QUEUE_LENGTH = Gauge(
    "sie_queue_length",
    "Current queue length",
    ["queue"]
)

DLQ_LENGTH = Gauge(
    "sie_dlq_length",
    "Dead letter queue length"
)

# NLP metrics
NLP_PROCESSED = Counter(
    "sie_nlp_processed_total",
    "Total items processed by NLP",
    ["sentiment"]
)

NLP_DURATION = Histogram(
    "sie_nlp_duration_seconds",
    "NLP processing duration in seconds",
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0]
)

# OCR metrics
OCR_PROCESSED = Counter(
    "sie_ocr_processed_total",
    "Total images processed by OCR"
)

OCR_DURATION = Histogram(
    "sie_ocr_duration_seconds",
    "OCR processing duration in seconds",
    buckets=[0.1, 0.5, 1.0, 2.0, 5.0, 10.0]
)

OCR_CONFIDENCE = Histogram(
    "sie_ocr_confidence",
    "OCR confidence scores",
    buckets=[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
)

# Scraper metrics
SCRAPER_REQUESTS = Counter(
    "sie_scraper_requests_total",
    "Total scraper requests",
    ["platform", "status"]
)

SCRAPER_DURATION = Histogram(
    "sie_scraper_duration_seconds",
    "Scraper request duration in seconds",
    ["platform"],
    buckets=[0.5, 1.0, 2.0, 5.0, 10.0, 30.0]
)

# Storage metrics
INSIGHTS_STORED = Counter(
    "sie_insights_stored_total",
    "Total insights stored"
)

STORAGE_SIZE_BYTES = Gauge(
    "sie_storage_size_bytes",
    "Total storage size in bytes",
    ["storage_type"]  # hot, cold
)

# Circuit breaker metrics
CIRCUIT_BREAKER_STATE = Gauge(
    "sie_circuit_breaker_state",
    "Circuit breaker state (0=closed, 1=half_open, 2=open)",
    ["circuit"]
)

CIRCUIT_BREAKER_FAILURES = Counter(
    "sie_circuit_breaker_failures_total",
    "Total circuit breaker failure count",
    ["circuit"]
)

CIRCUIT_BREAKER_REJECTIONS = Counter(
    "sie_circuit_breaker_rejections_total",
    "Total requests rejected by circuit breaker",
    ["circuit"]
)


# ============================================================================
# Helper Functions
# ============================================================================

def init_service_info(version: str, environment: str):
    """Initialize service info metric."""
    SERVICE_INFO.info({
        "version": version,
        "environment": environment,
    })


def record_http_request(method: str, endpoint: str, status: int, duration: float):
    """Record HTTP request metrics."""
    HTTP_REQUESTS.labels(method=method, endpoint=endpoint, status=status).inc()
    HTTP_REQUEST_DURATION.labels(method=method, endpoint=endpoint).observe(duration)


def record_job_submitted(source_type: str, priority: str):
    """Record job submission."""
    JOBS_SUBMITTED.labels(source_type=source_type, priority=priority).inc()
    JOBS_IN_PROGRESS.inc()


def record_job_completed(status: str, source_type: str, duration: float):
    """Record job completion."""
    JOBS_COMPLETED.labels(status=status).inc()
    JOBS_IN_PROGRESS.dec()
    JOB_DURATION.labels(source_type=source_type).observe(duration)


def record_nlp_processed(sentiment: str, duration: float):
    """Record NLP processing."""
    NLP_PROCESSED.labels(sentiment=sentiment).inc()
    NLP_DURATION.observe(duration)


def record_ocr_processed(duration: float, confidence: float):
    """Record OCR processing."""
    OCR_PROCESSED.inc()
    OCR_DURATION.observe(duration)
    OCR_CONFIDENCE.observe(confidence)


def record_scraper_request(platform: str, status: str, duration: float):
    """Record scraper request."""
    SCRAPER_REQUESTS.labels(platform=platform, status=status).inc()
    SCRAPER_DURATION.labels(platform=platform).observe(duration)


def update_queue_length(queue: str, length: int):
    """Update queue length gauge."""
    QUEUE_LENGTH.labels(queue=queue).set(length)


def update_dlq_length(length: int):
    """Update DLQ length gauge."""
    DLQ_LENGTH.set(length)


def record_circuit_breaker_state(circuit: str, state: str):
    """Update circuit breaker state gauge."""
    state_map = {"closed": 0, "half_open": 1, "open": 2}
    CIRCUIT_BREAKER_STATE.labels(circuit=circuit).set(state_map.get(state, 0))


def record_circuit_breaker_failure(circuit: str):
    """Record a circuit breaker failure."""
    CIRCUIT_BREAKER_FAILURES.labels(circuit=circuit).inc()


def record_circuit_breaker_rejection(circuit: str):
    """Record a circuit breaker rejection."""
    CIRCUIT_BREAKER_REJECTIONS.labels(circuit=circuit).inc()


# ============================================================================
# Metrics Endpoint
# ============================================================================

@router.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint."""
    return Response(
        content=generate_latest(),
        media_type=CONTENT_TYPE_LATEST
    )
