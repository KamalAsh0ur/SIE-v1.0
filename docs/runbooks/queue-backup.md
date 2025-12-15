# Runbook: Queue Backup

**Alert:** `SIEQueueStagnation`, `SIEQueueCritical`  
**Severity:** P2 (stagnation) / P1 (critical)  
**Trigger:** Queue depth > 1000 for 10min / > 5000 for 5min

---

## 1. Initial Assessment (2 min)

```bash
# Check current queue lengths
kubectl exec -n sie deploy/sie-api -- curl -s localhost:8000/metrics | grep sie_queue

# Check worker status
kubectl get pods -n sie -l app.kubernetes.io/component=worker-ingestion

# Check Flower dashboard for worker health
# URL: https://flower.example.com/
```

## 2. Common Causes & Fixes

### 2.1 Workers Not Processing

**Symptoms:** Queue growing, but `sie_jobs_in_progress = 0`

```bash
# Check worker logs
kubectl logs -n sie -l app.kubernetes.io/component=worker-ingestion --tail=50

# Check if workers are connected to Redis
kubectl exec -n sie deploy/sie-worker-ingestion -- celery -A app.workers.celery_app inspect active
```

**Fix:**
```bash
# Restart workers
kubectl rollout restart deploy/sie-worker-ingestion -n sie
```

### 2.2 Slow Processing (Backlog Growing)

**Symptoms:** Jobs in progress, but queue keeps growing

```bash
# Check job duration P95
kubectl exec -n sie deploy/sie-api -- curl -s localhost:8000/metrics | grep sie_job_duration
```

**Fix: Scale workers**
```bash
# Scale ingestion workers
kubectl scale deploy/sie-worker-ingestion -n sie --replicas=8

# Or trigger HPA
kubectl patch hpa sie-worker-ingestion-hpa -n sie -p '{"spec":{"minReplicas":4}}'
```

### 2.3 Stuck Jobs (Deadlock/Hang)

**Symptoms:** Same jobs processing for extended time

```bash
# Check active tasks
kubectl exec -n sie deploy/sie-worker-ingestion -- celery -A app.workers.celery_app inspect active
```

**Fix:**
```bash
# Revoke stuck tasks (get task ID from above)
kubectl exec -n sie deploy/sie-worker-ingestion -- celery -A app.workers.celery_app control revoke <task_id> --terminate
```

## 3. Emergency: Clear Queue

⚠️ **USE WITH CAUTION - Data loss possible**

```bash
# View queue without clearing
kubectl exec -n sie deploy/sie-api -- redis-cli -u $REDIS_URL LLEN ingestion

# Clear entire queue (DESTRUCTIVE)
kubectl exec -n sie deploy/sie-api -- redis-cli -u $REDIS_URL DEL ingestion
```

## 4. Dead Letter Queue (DLQ)

```bash
# Check DLQ size
kubectl exec -n sie deploy/sie-api -- redis-cli -u $REDIS_URL LLEN dead_letter

# View DLQ items
kubectl exec -n sie deploy/sie-api -- redis-cli -u $REDIS_URL LRANGE dead_letter 0 10
```

**Replay DLQ items:**
```bash
# Trigger scheduled DLQ processing task
kubectl exec -n sie deploy/sie-worker-ingestion -- celery -A app.workers.celery_app call app.workers.scheduled.process_dead_letter_queue
```

## 5. Resolution Checklist

- [ ] Queue depth returned to < 100
- [ ] Worker pods healthy
- [ ] DLQ reviewed and addressed
- [ ] HPA reset to normal thresholds
