# SIE Backend Dockerfile
# Multi-stage build for smaller production image

FROM python:3.11-slim as base

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONFAULTHANDLER=1 \
    PIP_NO_CACHE_DIR=off \
    PIP_DISABLE_PIP_VERSION_CHECK=on

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    tesseract-ocr \
    tesseract-ocr-eng \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# ============================================================================
# Builder stage - install dependencies
# ============================================================================
FROM base as builder

# Install Python dependencies
COPY requirements.txt .
RUN pip install --user -r requirements.txt

# Download spaCy model
RUN python -m spacy download en_core_web_sm

# ============================================================================
# Production stage
# ============================================================================
FROM base as production

# Copy installed dependencies from builder
COPY --from=builder /root/.local /root/.local

# Make sure scripts in .local are usable
ENV PATH=/root/.local/bin:$PATH

# Copy application code
COPY . .

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:8000/health')" || exit 1

# Default command - run API server
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

# ============================================================================
# Worker stage - for Celery workers
# ============================================================================
FROM production as worker

# Run Celery worker
CMD ["celery", "-A", "app.workers.celery_app", "worker", "--loglevel=info", "--concurrency=4"]

# ============================================================================
# Development stage
# ============================================================================
FROM production as development

# Install dev dependencies
RUN pip install --user watchdog pytest pytest-asyncio

# Run with hot reload
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
