"""
OpenTelemetry Distributed Tracing

Provides end-to-end tracing across HTTP requests, database, Redis, and Celery.
Implements SRE Plan §5.3 requirements.
"""

from typing import Optional
from contextvars import ContextVar

from app.config import settings
from app.core.logging import get_logger

logger = get_logger("tracing")

# Trace context for manual propagation
trace_id_var: ContextVar[str] = ContextVar("trace_id", default="")
span_id_var: ContextVar[str] = ContextVar("span_id", default="")

# Global tracer provider
_tracer_provider = None
_tracer = None


def setup_tracing(app=None):
    """
    Initialize OpenTelemetry tracing.
    
    Call this at application startup. Gracefully handles missing dependencies.
    
    Args:
        app: FastAPI application instance for auto-instrumentation
    """
    global _tracer_provider, _tracer
    
    if not settings.tracing_enabled:
        logger.info("tracing_disabled", reason="TRACING_ENABLED=false")
        return None
    
    try:
        from opentelemetry import trace
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.sdk.resources import Resource, SERVICE_NAME
        
        # Create resource with service metadata
        resource = Resource.create({
            SERVICE_NAME: "sie-backend",
            "service.version": settings.api_version,
            "deployment.environment": settings.environment,
        })
        
        # Create tracer provider
        _tracer_provider = TracerProvider(resource=resource)
        
        # Configure exporter based on settings
        endpoint = settings.otel_exporter_endpoint or "http://localhost:4317"
        
        try:
            from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
            exporter = OTLPSpanExporter(endpoint=endpoint, insecure=True)
            _tracer_provider.add_span_processor(BatchSpanProcessor(exporter))
            logger.info("tracing_exporter_configured", endpoint=endpoint, type="otlp-grpc")
        except ImportError:
            # Fallback to console exporter for development
            from opentelemetry.sdk.trace.export import ConsoleSpanExporter
            _tracer_provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))
            logger.info("tracing_exporter_configured", type="console")
        
        # Set global tracer provider
        trace.set_tracer_provider(_tracer_provider)
        _tracer = trace.get_tracer("sie-backend", settings.api_version)
        
        # Instrument FastAPI
        if app:
            try:
                from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
                FastAPIInstrumentor.instrument_app(app)
                logger.info("tracing_instrumented", component="fastapi")
            except ImportError:
                logger.warning("tracing_instrumentation_skipped", component="fastapi")
        
        # Instrument Redis
        try:
            from opentelemetry.instrumentation.redis import RedisInstrumentor
            RedisInstrumentor().instrument()
            logger.info("tracing_instrumented", component="redis")
        except ImportError:
            pass
        
        # Instrument Celery
        try:
            from opentelemetry.instrumentation.celery import CeleryInstrumentor
            CeleryInstrumentor().instrument()
            logger.info("tracing_instrumented", component="celery")
        except ImportError:
            pass
        
        # Instrument HTTP clients
        try:
            from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
            HTTPXClientInstrumentor().instrument()
            logger.info("tracing_instrumented", component="httpx")
        except ImportError:
            pass
        
        logger.info("tracing_initialized", endpoint=endpoint)
        return _tracer_provider
        
    except ImportError as e:
        logger.warning("tracing_unavailable", error=str(e))
        return None


def get_tracer(name: str = "sie-backend"):
    """
    Get a tracer instance for manual instrumentation.
    
    Args:
        name: Name of the tracer (usually module/component name)
    
    Returns:
        A tracer instance, or a no-op tracer if tracing is disabled
    """
    global _tracer
    
    if _tracer is not None:
        return _tracer
    
    try:
        from opentelemetry import trace
        return trace.get_tracer(name)
    except ImportError:
        return NoOpTracer()


class NoOpSpan:
    """No-op span for when tracing is disabled."""
    
    def __enter__(self):
        return self
    
    def __exit__(self, *args):
        pass
    
    def set_attribute(self, key, value):
        pass
    
    def add_event(self, name, attributes=None):
        pass
    
    def set_status(self, status):
        pass
    
    def record_exception(self, exception):
        pass


class NoOpTracer:
    """No-op tracer for when OpenTelemetry is not available."""
    
    def start_as_current_span(self, name, **kwargs):
        return NoOpSpan()
    
    def start_span(self, name, **kwargs):
        return NoOpSpan()


def create_span(name: str, attributes: Optional[dict] = None):
    """
    Create a new span for tracing.
    
    Usage:
        with create_span("process_nlp", {"text_length": len(text)}) as span:
            result = process_text(text)
            span.set_attribute("sentiment", result["sentiment"])
    
    Args:
        name: Name of the span
        attributes: Optional initial attributes
    
    Returns:
        A context manager for the span
    """
    tracer = get_tracer()
    span = tracer.start_as_current_span(name)
    
    if attributes:
        for key, value in attributes.items():
            try:
                span.set_attribute(key, value)
            except (AttributeError, TypeError):
                pass  # No-op tracer
    
    return span


def add_span_attribute(key: str, value):
    """Add an attribute to the current span."""
    try:
        from opentelemetry import trace
        current_span = trace.get_current_span()
        if current_span:
            current_span.set_attribute(key, value)
    except (ImportError, AttributeError):
        pass


def record_exception(exception: Exception):
    """Record an exception in the current span."""
    try:
        from opentelemetry import trace
        current_span = trace.get_current_span()
        if current_span:
            current_span.record_exception(exception)
    except (ImportError, AttributeError):
        pass
