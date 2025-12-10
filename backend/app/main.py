"""
SIE Backend - Smart Ingestion Engine

FastAPI application entry point.
"""

from contextlib import asynccontextmanager

try:
    import sentry_sdk
    SENTRY_AVAILABLE = True
except ImportError:
    SENTRY_AVAILABLE = False

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.api.routes import ingest, jobs, insights, events, health

# Optional imports
try:
    from app.api.routes import search
    SEARCH_AVAILABLE = True
except ImportError:
    SEARCH_AVAILABLE = False

try:
    from app.core.metrics import router as metrics_router
    METRICS_AVAILABLE = True
except ImportError:
    METRICS_AVAILABLE = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup/shutdown events."""
    # Startup
    print(f"🚀 Starting {settings.api_title} v{settings.api_version}")
    
    # Initialize Sentry if configured
    if SENTRY_AVAILABLE and settings.sentry_dsn:
        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            environment=settings.environment,
            traces_sample_rate=0.1,
        )
    
    yield
    
    # Shutdown
    print("👋 Shutting down SIE Backend")


# Create FastAPI application
app = FastAPI(
    title=settings.api_title,
    version=settings.api_version,
    description="Smart Ingestion Engine for content scraping, NLP analysis, and insight generation",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Include routers
app.include_router(health.router, tags=["Health"])
app.include_router(ingest.router, prefix="/ingest", tags=["Ingestion"])
app.include_router(jobs.router, prefix="/jobs", tags=["Jobs"])
app.include_router(insights.router, prefix="/insights", tags=["Insights"])
app.include_router(events.router, prefix="/events", tags=["Events"])

if SEARCH_AVAILABLE:
    app.include_router(search.router, prefix="/search", tags=["Search"])

if METRICS_AVAILABLE:
    app.include_router(metrics_router, tags=["Metrics"])


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler for unhandled errors."""
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "detail": str(exc) if settings.debug else "An unexpected error occurred",
        },
    )


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug,
    )
