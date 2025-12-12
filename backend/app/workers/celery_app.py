"""
Celery Application Configuration

Configures Celery with Redis as broker and result backend.
Implements SRS §5.5 requirements.
"""

from celery import Celery

from app.config import settings


# Create Celery app
celery_app = Celery(
    "sie_worker",
    broker=settings.celery_broker,
    backend=settings.celery_backend,
    include=["app.workers.tasks"],
)

# Celery configuration - Optimized for production scalability
celery_app.conf.update(
    # Task settings
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    
    # Task execution - Optimized for high throughput
    task_acks_late=True,  # Tasks acknowledged after completion (safer)
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=4,  # Prefetch 4 tasks per worker for throughput
    worker_concurrency=8,  # 8 concurrent tasks per worker process
    
    # Worker auto-scaling: min 2, max 16 workers per process
    worker_autoscale=(16, 2),
    
    # Task time limits
    task_soft_time_limit=300,  # 5 minutes soft limit
    task_time_limit=600,  # 10 minutes hard limit
    
    # Result backend settings
    result_expires=86400,  # Results expire after 24 hours
    result_extended=True,  # Store additional task metadata
    
    # Priority queue configuration
    task_default_priority=5,
    task_queue_max_priority=10,
    
    # Retry settings with exponential backoff
    task_default_retry_delay=60,  # 1 minute default retry delay
    task_publish_retry=True,
    task_publish_retry_policy={
        'max_retries': 3,
        'interval_start': 1,
        'interval_step': 2,
        'interval_max': 30,
    },
    
    # Task routing for specialized workers
    task_routes={
        "app.workers.tasks.process_ingestion_job": {"queue": "ingestion"},
        "app.workers.tasks.run_nlp_analysis": {"queue": "nlp"},
        "app.workers.tasks.run_ocr_extraction": {"queue": "ocr"},
    },
    
    # Monitoring
    worker_send_task_events=True,
    task_send_sent_event=True,
    
    # Connection pool for Redis
    broker_pool_limit=20,
    result_backend_max_retries=10,
)

# Optional: Configure priority queues
celery_app.conf.broker_transport_options = {
    "priority_steps": list(range(11)),  # 0-10 priority levels
    "queue_order_strategy": "priority",
}


# Task event callbacks for monitoring
@celery_app.on_after_configure.connect
def setup_periodic_tasks(sender, **kwargs):
    """Setup periodic tasks if needed."""
    # Example: Health check every 5 minutes
    # sender.add_periodic_task(300.0, health_check.s(), name='health-check')
    pass
