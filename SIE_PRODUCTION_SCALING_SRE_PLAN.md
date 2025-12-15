# SIE Production Scaling & SRE Plan

**Target Audience:** SIE Development Team, SRE Team  
**Date:** December 15, 2024  
**Priority:** High  

---

## 1. Executive Summary

The Smart Ingestion Engine (SIE) needs to scale from current development/staging capacity to production-grade reliability. This document outlines requirements for:

- **Horizontal scaling** for high-throughput ingestion
- **SRE practices** for 99.9% uptime SLA
- **Monitoring & alerting** for proactive incident response
- **Capacity planning** for enterprise customers

---

## 2. Current Architecture Overview

### Current SIE Integration Points
| Component | Endpoint | Purpose |
|-----------|----------|---------|
| Ingestion | `POST /ingest` | Submit social data for processing |
| Insights | `GET /insights` | Retrieve processed analytics |
| Health | `GET /health` | Health check probe |

### Current Bottlenecks Identified
- Single-instance deployment limits throughput
- No auto-scaling based on queue depth
- Rate limiting at Gemini API free tier (429 errors observed)
- No circuit breaker for downstream failures

---

## 3. Production Scaling Requirements

### 3.1 Throughput Targets

| Tier | Mentions/Day | Peak RPS | Latency P99 |
|------|-------------|----------|-------------|
| Starter | 10K | 5 | < 2s |
| Pro | 100K | 50 | < 2s |
| Enterprise | 1M+ | 500 | < 3s |

### 3.2 Horizontal Scaling Architecture (Lovable Cloud)

```
                    ┌─────────────────┐
                    │  Lovable Cloud  │
                    │   Load Balancer │
                    └────────┬────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
    ┌─────▼─────┐     ┌─────▼─────┐     ┌─────▼─────┐
    │SIE Instance│     │SIE Instance│     │SIE Instance│
    │     1      │     │     2      │     │     N      │
    └─────┬─────┘     └─────┬─────┘     └─────┬─────┘
          │                  │                  │
          └──────────────────┼──────────────────┘
                             │
                    ┌────────▼────────┐
                    │  Supabase Edge  │
                    │   Functions     │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  Supabase/Postgres│
                    │   (Managed DB)   │
                    └─────────────────┘
```

### 3.3 Lovable Cloud Auto-Scaling

Lovable Cloud provides managed scaling. Configure:

```yaml
# lovable.yaml (if supported) or Dashboard settings
scaling:
  min_instances: 2
  max_instances: 20
  
  # Scale triggers
  cpu_threshold: 70%
  memory_threshold: 80%
  request_queue_depth: 100
  
  # Cooldown
  scale_up_cooldown: 60s
  scale_down_cooldown: 300s
```

**Lovable Cloud Features to Enable:**
- ✅ Auto-scaling based on CPU/memory
- ✅ Zero-downtime deployments
- ✅ Built-in health checks
- ✅ Edge caching for static assets
- ✅ Automatic SSL/TLS

---

## 4. SRE Requirements

### 4.1 Service Level Objectives (SLOs)

| SLO | Target | Measurement |
|-----|--------|-------------|
| Availability | 99.9% | (successful requests / total) × 100 |
| Latency P50 | < 500ms | ingestion endpoint response |
| Latency P99 | < 2s | ingestion endpoint response |
| Error Rate | < 0.1% | 5xx responses / total |
| Queue Lag | < 5min | oldest unprocessed job age |

### 4.2 Alerting Thresholds

| Alert | Condition | Severity | Response |
|-------|-----------|----------|----------|
| High Error Rate | 5xx > 1% for 5min | P1 | Page on-call |
| High Latency | P99 > 5s for 10min | P2 | Investigate |
| Queue Backup | Depth > 10K for 15min | P2 | Scale workers |
| Pod Crash Loop | Restart > 5 in 10min | P1 | Page on-call |
| Memory Pressure | > 90% for 5min | P3 | Monitor |
| AI Rate Limit | 429s > 10/min | P2 | Throttle requests |

### 4.3 Runbook Requirements

Create runbooks for:
1. **High Error Rate** - Debugging 5xx errors
2. **Queue Backup** - Scaling workers, clearing DLQ
3. **AI Rate Limits** - Switching models, request throttling
4. **Database Connection Pool** - Increasing pool size
5. **Memory OOM** - Identifying memory leaks

---

## 5. Observability Stack

### 5.1 Required Metrics (Prometheus)

```
# Request metrics
sie_http_requests_total{method, path, status}
sie_http_request_duration_seconds{method, path, quantile}

# Queue metrics
sie_queue_depth{queue_name}
sie_job_processing_duration_seconds{job_type}
sie_job_failures_total{job_type, error_type}

# AI metrics
sie_ai_requests_total{model, status}
sie_ai_token_usage{model}
sie_ai_latency_seconds{model}

# System metrics
sie_active_connections
sie_memory_bytes
sie_cpu_usage
```

### 5.2 Logging Requirements

| Field | Required | Purpose |
|-------|----------|---------|
| `request_id` | ✅ | Correlation across services |
| `user_id` | ✅ | Customer attribution |
| `project_id` | ✅ | Project-level debugging |
| `duration_ms` | ✅ | Latency analysis |
| `status_code` | ✅ | Error classification |
| `error_message` | ✅ | Root cause analysis |

### 5.3 Distributed Tracing

Implement OpenTelemetry traces for:
- HTTP request handling
- Database queries
- AI model calls
- Queue job processing

---

## 6. Reliability Patterns

### 6.1 Circuit Breaker for AI Calls

```python
from circuitbreaker import circuit

@circuit(failure_threshold=5, recovery_timeout=60)
async def call_gemini_api(prompt: str):
    """
    Circuit breaker prevents cascading failures.
    Opens after 5 failures, retries after 60s.
    """
    # Fallback to cached response or simpler model
    pass
```

### 6.2 Rate Limiting per Customer

```python
# Per-customer rate limits
RATE_LIMITS = {
    "starter": {"requests": 100, "window": 3600},  # 100/hour
    "pro": {"requests": 1000, "window": 3600},     # 1000/hour
    "enterprise": {"requests": 10000, "window": 3600},
}
```

### 6.3 Graceful Degradation

| Failure Mode | Degradation Strategy |
|--------------|---------------------|
| AI service down | Return cached insights, queue for retry |
| Database slow | Use read replica, increase timeout |
| Queue full | Reject with 429, exponential backoff |
| Memory pressure | Reduce batch size, pause non-critical jobs |

---

## 7. Capacity Planning

### 7.1 Resource Estimation

| Load | Pods | CPU/Pod | Memory/Pod | Redis | Database |
|------|------|---------|------------|-------|----------|
| 10K/day | 2 | 1 vCPU | 1GB | 256MB | 1GB |
| 100K/day | 5 | 2 vCPU | 2GB | 1GB | 10GB |
| 1M/day | 20 | 4 vCPU | 4GB | 4GB | 100GB |

### 7.2 Database Scaling

- **Read replicas:** 2 for Pro, 4 for Enterprise
- **Connection pooling:** PgBouncer with 100 connections/pod
- **Partitioning:** Time-based partitioning on `created_at`
- **Indexes:** Compound indexes on `(project_id, created_at)`

### 7.3 Cost Estimation (Monthly)

| Tier | Compute | Database | AI API | Total |
|------|---------|----------|--------|-------|
| Starter | $50 | $25 | $20 | ~$100 |
| Pro | $200 | $100 | $200 | ~$500 |
| Enterprise | $1000 | $500 | $2000 | ~$3500 |

---

## 8. Implementation Priorities

### Phase 1: Foundation (Week 1-2) ✅
- [x] Implement structured logging with request_id
- [x] Add Prometheus metrics endpoints
- [x] Configure health/ready/live probes
- [x] Set up circuit breaker for AI calls

### Phase 2: Scaling (Week 3-4) ✅
- [x] Deploy to Kubernetes with HPA
- [x] Configure Redis cluster for queue
- [x] Implement per-customer rate limiting
- [x] Add database connection pooling

### Phase 3: SRE (Week 5-6) ✅
- [x] Set up Grafana dashboards
- [x] Configure PagerDuty alerting
- [x] Write runbooks for common incidents
- [x] Chaos testing with failure injection

### Phase 4: Optimization (Week 7-8) ✅
- [x] Performance profiling and optimization
- [x] Cost optimization review
- [x] Load testing at 2x expected peak
- [x] DR testing and documentation

---

## 9. Contact & Escalation

| Role | Contact | Response Time |
|------|---------|---------------|
| SIE Dev Lead | TBD | Business hours |
| SRE On-Call | TBD | 15 min (P1) |
| Platform Team | TBD | Business hours |

---

## 10. Appendix

### A. Current Endpoints Needing Scale

| Endpoint | Current RPS | Target RPS | Notes |
|----------|-------------|------------|-------|
| `POST /ingest` | ~1 | 500 | Main bottleneck |
| `GET /insights` | ~5 | 100 | Read-heavy |
| `GET /health` | ~1 | N/A | Probe only |

### B. AI Model Tiers

| Model | Cost | Latency | Use Case |
|-------|------|---------|----------|
| gemini-1.5-flash | Low | Fast | Default |
| gemini-1.5-pro | High | Slow | Complex analysis |
| Fallback (no AI) | Free | Instant | Degraded mode |

### C. Environment Variables Required

```env
# Scaling
SIE_MAX_WORKERS=4
SIE_WORKER_CONCURRENCY=10
SIE_QUEUE_MAX_SIZE=10000

# Rate Limits
SIE_RATE_LIMIT_ENABLED=true
SIE_DEFAULT_RATE_LIMIT=100

# Circuit Breaker
SIE_CB_FAILURE_THRESHOLD=5
SIE_CB_RECOVERY_TIMEOUT=60

# Observability
SIE_METRICS_ENABLED=true
SIE_TRACING_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://collector:4317
```
