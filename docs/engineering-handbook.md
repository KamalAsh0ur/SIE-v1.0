# SIE Engineering Handbook
## Smart Ingestion Engine — Operations Guide

---

## 1. Architecture Overview

The SIE is a Python-based backend service that ingests, enriches, and indexes content from multiple sources.

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   FastAPI   │────▶│    Redis    │────▶│   Celery    │
│  API Server │     │   (Queue)   │     │   Workers   │
└─────────────┘     └─────────────┘     └─────────────┘
       │                                       │
       ▼                                       ▼
┌─────────────┐                         ┌─────────────┐
│ PostgreSQL  │◀────────────────────────│  NLP/OCR    │
│  Database   │                         │  Services   │
└─────────────┘                         └─────────────┘
       │
       ▼
┌─────────────┐
│ Meilisearch │
│   (Index)   │
└─────────────┘
```

### Key Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| API Server | FastAPI | HTTP endpoints |
| Workers | Celery | Async job processing |
| Queue | Redis | Job distribution |
| Database | PostgreSQL | Primary storage |
| Search | Meilisearch | Full-text search |
| NLP | spaCy + VADER | Text analysis |
| OCR | EasyOCR | Image text extraction |

---

## 2. Runbook

### 2.1 Health Checks

```bash
# API health
curl http://localhost:8000/health

# Redis health
redis-cli ping

# PostgreSQL health
pg_isready -h localhost -p 5432

# Celery worker status
celery -A app.workers.celery_app inspect ping
```

### 2.2 Starting Services

```bash
# Development (Docker Compose)
cd backend
docker-compose up -d

# Production (individual services)
uvicorn app.main:app --host 0.0.0.0 --port 8000
celery -A app.workers.celery_app worker --loglevel=info --concurrency=4
```

### 2.3 Stopping Services

```bash
# Docker Compose
docker-compose down

# Graceful worker shutdown
celery -A app.workers.celery_app control shutdown
```

### 2.4 Viewing Logs

```bash
# API logs
docker-compose logs -f api

# Worker logs
docker-compose logs -f worker

# All logs
docker-compose logs -f

# Filter by log level
docker-compose logs -f | jq 'select(.level == "error")'
```

---

## 3. Troubleshooting

### 3.1 Jobs Stuck in Pending

**Symptoms**: Jobs submitted but not progressing

**Diagnosis**:
```bash
# Check Redis queue length
redis-cli LLEN ingestion

# Check worker status
celery -A app.workers.celery_app inspect active

# Check worker logs for errors
docker-compose logs worker | tail -100
```

**Resolution**:
1. Restart workers: `docker-compose restart worker`
2. Check Redis connectivity
3. Verify worker can connect to PostgreSQL

### 3.2 High Memory Usage

**Symptoms**: Workers consuming excessive RAM

**Diagnosis**:
```bash
# Check worker memory
docker stats --no-stream | grep worker

# Check for memory leaks
celery -A app.workers.celery_app inspect stats
```

**Resolution**:
1. Increase worker memory limit in docker-compose.yml
2. Reduce batch size in processing
3. Restart workers periodically: `--max-tasks-per-child=100`

### 3.3 NLP/OCR Timeouts

**Symptoms**: Jobs failing with timeout errors

**Diagnosis**:
```bash
# Check average processing time
cat logs/*.json | jq 'select(.event == "nlp_processed") | .duration_ms' | awk '{sum+=$1; count++} END {print sum/count}'
```

**Resolution**:
1. Increase task timeout in Celery config
2. Add more workers for NLP/OCR queues
3. Check if models are loaded (cold start issue)

### 3.4 Dead Letter Queue Growth

**Symptoms**: DLQ length increasing

**Diagnosis**:
```bash
# Check DLQ length
redis-cli LLEN dead_letter

# View DLQ entries
redis-cli LRANGE dead_letter 0 10
```

**Resolution**:
1. Review failed job errors
2. Fix underlying issues (usually external service failures)
3. Replay valid jobs manually
4. Clear invalid jobs

### 3.5 API Rate Limiting

**Symptoms**: 429 responses from API

**Diagnosis**:
```bash
# Check rate limit counters
redis-cli KEYS "rate_limit:*"
redis-cli GET "rate_limit:<client_key>"
```

**Resolution**:
1. Increase rate limits for legitimate high-volume clients
2. Implement client-side backoff
3. Review for abuse patterns

---

## 4. Scaling Guidelines

### 4.1 Horizontal Scaling

| Load Level | API Instances | Workers | Notes |
|------------|---------------|---------|-------|
| Low (<1k/hr) | 1 | 2 | Development |
| Medium (<10k/hr) | 2 | 4 | Staging |
| High (<50k/hr) | 3 | 8 | Production |
| Peak (>50k/hr) | 5 | 16 | Auto-scale |

### 4.2 Worker Scaling

```yaml
# Scale workers dynamically
docker-compose up -d --scale worker=4

# Or in Kubernetes
kubectl scale deployment sie-worker --replicas=8
```

### 4.3 Database Scaling

- **Read replicas**: Add for insight queries
- **Connection pooling**: Use PgBouncer
- **Partitioning**: By tenant or date for large tables
- **Archival**: Move old data to cold storage

### 4.4 Queue Scaling

- **Priority queues**: Separate high/normal/low
- **Dedicated workers**: OCR-specific workers
- **Queue length alerts**: < 1000 healthy

---

## 5. Configuration Reference

### 5.1 Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `REDIS_URL` | Yes | - | Redis connection string |
| `API_SECRET_KEY` | Yes | - | JWT signing key |
| `MEILISEARCH_URL` | No | localhost:7700 | Search engine URL |
| `MEILISEARCH_KEY` | No | - | Meilisearch API key |
| `SENTRY_DSN` | No | - | Error tracking DSN |
| `ENVIRONMENT` | No | development | dev/staging/production |
| `DEBUG` | No | false | Enable debug mode |

### 5.2 Celery Settings

```python
# app/workers/celery_app.py
celery_app.conf.update(
    task_soft_time_limit=300,    # 5 minute soft limit
    task_time_limit=600,         # 10 minute hard limit
    worker_prefetch_multiplier=1,
    task_acks_late=True,
)
```

### 5.3 Rate Limits

```python
# Default rate limits per priority
RATE_LIMITS = {
    'low': {'requests': 10, 'period': 60},
    'normal': {'requests': 30, 'period': 60},
    'high': {'requests': 60, 'period': 60},
}
```

---

## 6. Monitoring

### 6.1 Key Metrics

| Metric | Alert Threshold | Action |
|--------|-----------------|--------|
| `sie_queue_length` | > 1000 | Scale workers |
| `sie_dlq_length` | > 100 | Investigate failures |
| `sie_job_duration_seconds` | p95 > 300s | Check NLP/OCR |
| `sie_http_request_duration` | p95 > 1s | Scale API |
| `sie_errors` | rate > 5% | Investigate |

### 6.2 Grafana Dashboards

Access at: `/grafana` (if configured)

Dashboards:
- **SIE Overview**: Key metrics at a glance
- **Job Processing**: Queue depth, processing times
- **NLP Performance**: Sentiment distribution, latency
- **API Health**: Request rates, error rates

### 6.3 Alerting

Alerts configured in Prometheus AlertManager:
- Critical: Service down, DLQ overflow
- Warning: High latency, elevated error rate
- Info: Deployment completed, scaling events

---

## 7. Deployment

### 7.1 Deployment Checklist

- [ ] All tests passing in CI
- [ ] Database migrations applied
- [ ] Environment variables configured
- [ ] Secrets updated
- [ ] Health checks passing
- [ ] Monitoring verified
- [ ] Rollback plan ready

### 7.2 Rollback Procedure

```bash
# Fly.io rollback
flyctl releases list --app sie-backend
flyctl releases rollback --app sie-backend <version>

# Docker rollback
docker-compose down
docker-compose -f docker-compose.yml -f docker-compose.rollback.yml up -d
```

### 7.3 Database Migrations

```bash
# Apply migrations
alembic upgrade head

# Rollback one migration
alembic downgrade -1

# View migration history
alembic history
```

---

## 8. Security

### 8.1 API Authentication

All requests require `X-API-Key` header:
```bash
curl -H "X-API-Key: your-api-key" http://api.sie.example.com/ingest
```

### 8.2 Secrets Management

- Store secrets in environment variables
- Use Fly.io secrets or Kubernetes secrets
- Never commit secrets to git
- Rotate API keys quarterly

### 8.3 Network Security

- TLS required for all external traffic
- Internal services on private network
- Database not exposed publicly
- Redis authentication enabled

---

## 9. Contact

| Role | Contact |
|------|---------|
| Engineering Lead | engineering@example.com |
| On-call | PagerDuty: sie-oncall |
| Support | support@example.com |

---

*Last Updated: February 2025*
