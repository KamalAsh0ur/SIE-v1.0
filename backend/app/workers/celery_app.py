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

# Celery configuration
celery_app.conf.update(
    # Task settings
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    
    # Task execution
    task_acks_late=True,  # Tasks acknowledged after completion (safer)
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,  # One task at a time per worker
    
    # Task time limits
    task_soft_time_limit=300,  # 5 minutes soft limit
    task_time_limit=600,  # 10 minutes hard limit
    
    # Result backend settings
    result_expires=86400,  # Results expire after 24 hours
    
    # Priority queue configuration
    task_default_priority=5,
    task_queue_max_priority=10,
    
    # Retry settings
    task_default_retry_delay=60,  # 1 minute default retry delay
    
    # Dead letter queue for failed tasks
    task_routes={
        "app.workers.tasks.process_ingestion_job": {"queue": "ingestion"},
        "app.workers.tasks.run_nlp_analysis": {"queue": "nlp"},
        "app.workers.tasks.run_ocr_extraction": {"queue": "ocr"},
    },
    
    # Monitoring
    worker_send_task_events=True,
    task_send_sent_event=True,
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
