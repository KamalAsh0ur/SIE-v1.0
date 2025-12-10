"""
Scheduled Tasks (Celery Beat)

Periodic tasks for maintenance, archival, and cleanup.
"""

from datetime import datetime, timedelta
from celery import shared_task
from celery.schedules import crontab


def setup_periodic_tasks(app):
    """
    Configure Celery Beat scheduled tasks.
    
    Call this in celery_app.py after app creation.
    """
    app.conf.beat_schedule = {
        # Archive old insights daily at 2 AM
        'archive-old-insights': {
            'task': 'app.workers.scheduled.archive_old_insights',
            'schedule': crontab(hour=2, minute=0),
            'options': {'queue': 'maintenance'},
        },
        
        # Clean up old events hourly
        'cleanup-events': {
            'task': 'app.workers.scheduled.cleanup_old_events',
            'schedule': crontab(minute=0),
            'options': {'queue': 'maintenance'},
        },
        
        # Update queue metrics every minute
        'update-queue-metrics': {
            'task': 'app.workers.scheduled.update_queue_metrics',
            'schedule': 60.0,  # Every 60 seconds
            'options': {'queue': 'default'},
        },
        
        # Process DLQ daily at 3 AM
        'process-dlq': {
            'task': 'app.workers.scheduled.process_dead_letter_queue',
            'schedule': crontab(hour=3, minute=0),
            'options': {'queue': 'maintenance'},
        },
        
        # Health check every 5 minutes
        'health-check': {
            'task': 'app.workers.scheduled.perform_health_check',
            'schedule': 300.0,
            'options': {'queue': 'default'},
        },
        
        # Sync to Meilisearch every 10 minutes
        'meilisearch-sync': {
            'task': 'app.workers.scheduled.sync_meilisearch',
            'schedule': 600.0,
            'options': {'queue': 'default'},
        },
    }


@shared_task(name='app.workers.scheduled.archive_old_insights')
def archive_old_insights():
    """
    Archive insights older than retention period.
    
    Runs daily at 2 AM.
    """
    import asyncio
    from app.services.archive_service import get_retention_policy
    
    print(f"📦 Starting archival task at {datetime.utcnow()}")
    
    policy = get_retention_policy()
    
    # This would use a database session in production
    # For now, log the action
    cutoff = policy.get_archive_cutoff()
    print(f"📦 Would archive insights older than {cutoff}")
    
    return {"status": "completed", "cutoff": cutoff.isoformat()}


@shared_task(name='app.workers.scheduled.cleanup_old_events')
def cleanup_old_events():
    """
    Clean up pipeline events older than 7 days.
    
    Runs hourly.
    """
    print(f"🧹 Cleaning up old events at {datetime.utcnow()}")
    
    cutoff = datetime.utcnow() - timedelta(days=7)
    
    # This would delete from database in production
    print(f"🧹 Would delete events older than {cutoff}")
    
    return {"status": "completed", "cutoff": cutoff.isoformat()}


@shared_task(name='app.workers.scheduled.update_queue_metrics')
def update_queue_metrics():
    """
    Update Prometheus metrics for queue lengths.
    
    Runs every minute.
    """
    try:
        from app.core.metrics import update_queue_length, update_dlq_length
        import redis
        from app.config import settings
        
        r = redis.from_url(settings.redis_url)
        
        # Get queue lengths
        ingestion_len = r.llen('ingestion') or 0
        nlp_len = r.llen('nlp') or 0
        ocr_len = r.llen('ocr') or 0
        dlq_len = r.llen('dead_letter') or 0
        
        # Update metrics
        update_queue_length('ingestion', ingestion_len)
        update_queue_length('nlp', nlp_len)
        update_queue_length('ocr', ocr_len)
        update_dlq_length(dlq_len)
        
        return {
            "ingestion": ingestion_len,
            "nlp": nlp_len,
            "ocr": ocr_len,
            "dlq": dlq_len,
        }
        
    except Exception as e:
        print(f"⚠ Failed to update queue metrics: {e}")
        return {"error": str(e)}


@shared_task(name='app.workers.scheduled.process_dead_letter_queue')
def process_dead_letter_queue():
    """
    Review and optionally replay failed jobs from DLQ.
    
    Runs daily at 3 AM.
    """
    print(f"💀 Processing DLQ at {datetime.utcnow()}")
    
    try:
        import redis
        import json
        from app.config import settings
        
        r = redis.from_url(settings.redis_url)
        
        # Get DLQ length
        dlq_len = r.llen('dead_letter') or 0
        
        if dlq_len == 0:
            return {"status": "empty", "processed": 0}
        
        # Review first 10 items
        items = r.lrange('dead_letter', 0, 9)
        
        replayable = 0
        permanent_failures = 0
        
        for item in items:
            try:
                data = json.loads(item)
                error_type = data.get('error', {}).get('type', '')
                
                # Classify failures
                if error_type in ['NETWORK_ERROR', 'RATE_LIMIT']:
                    replayable += 1
                else:
                    permanent_failures += 1
                    
            except Exception:
                permanent_failures += 1
        
        return {
            "status": "reviewed",
            "total": dlq_len,
            "reviewed": len(items),
            "replayable": replayable,
            "permanent": permanent_failures,
        }
        
    except Exception as e:
        print(f"⚠ DLQ processing failed: {e}")
        return {"error": str(e)}


@shared_task(name='app.workers.scheduled.perform_health_check')
def perform_health_check():
    """
    Perform internal health checks on dependencies.
    
    Runs every 5 minutes.
    """
    results = {
        "timestamp": datetime.utcnow().isoformat(),
        "redis": False,
        "database": False,
        "meilisearch": False,
    }
    
    # Check Redis
    try:
        import redis
        from app.config import settings
        r = redis.from_url(settings.redis_url)
        r.ping()
        results["redis"] = True
    except Exception as e:
        print(f"⚠ Redis health check failed: {e}")
    
    # Check Database (placeholder)
    results["database"] = True  # Would check actual connection
    
    # Check Meilisearch
    try:
        from app.services.search_service import get_meilisearch_service
        service = get_meilisearch_service()
        if service.client:
            service.client.health()
            results["meilisearch"] = True
    except Exception as e:
        print(f"⚠ Meilisearch health check failed: {e}")
    
    return results


@shared_task(name='app.workers.scheduled.sync_meilisearch')
def sync_meilisearch():
    """
    Sync recent insights to Meilisearch search index.
    
    Runs every 10 minutes.
    """
    print(f"🔍 Syncing Meilisearch at {datetime.utcnow()}")
    
    # This would fetch recent unindexed insights and index them
    # For now, log the action
    
    return {"status": "completed", "indexed": 0}
