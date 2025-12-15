# Runbook: High Error Rate

**Alert:** `SIEHighErrorRate`  
**Severity:** P1  
**Trigger:** 5xx errors > 5% for 2+ minutes

---

## 1. Initial Assessment (2 min)

```bash
# Check current error rate
curl -s http://sie-api:8000/health/detailed | jq

# View recent logs
kubectl logs -n sie -l app.kubernetes.io/component=api --tail=100 | grep -i error

# Check Grafana dashboard
# URL: https://grafana.example.com/d/sie-backend
```

## 2. Common Causes & Fixes

### 2.1 Database Connection Issues

**Symptoms:** `connection refused`, `too many connections`

```bash
# Check DB connectivity
kubectl exec -n sie deploy/sie-api -- python -c "import asyncpg; print('DB OK')"

# Check connection pool usage
kubectl exec -n sie deploy/sie-api -- curl localhost:8000/metrics | grep sie_active_connections
```

**Fix:**
```bash
# Restart pods to reset connection pool
kubectl rollout restart deploy/sie-api -n sie
```

### 2.2 Redis Connection Issues

**Symptoms:** `Redis connection error`, rate limiter failures

```bash
# Check Redis
kubectl exec -n sie deploy/sie-api -- redis-cli -u $REDIS_URL ping
```

**Fix:**
```bash
# If Redis is down, disable rate limiting temporarily
kubectl set env deploy/sie-api -n sie RATE_LIMIT_ENABLED=false
```

### 2.3 Upstream Service Failures

**Symptoms:** Circuit breakers open, external API timeouts

```bash
# Check circuit breaker status
curl -s http://sie-api:8000/health/detailed | jq '.circuit_breakers'
```

**Fix:** Wait for recovery timeout (60s default), or manually reset via restart.

## 3. Mitigation Steps

1. **Scale up** if load-related:
   ```bash
   kubectl scale deploy/sie-api -n sie --replicas=10
   ```

2. **Enable degraded mode** to return cached/fallback data:
   - Circuit breakers will automatically use fallbacks

3. **Block bad traffic** if attack suspected:
   ```bash
   # Add rate limit at ingress
   kubectl annotate ingress/sie-ingress -n sie \
     nginx.ingress.kubernetes.io/rate-limit=10
   ```

## 4. Resolution & Post-Incident

- [ ] Error rate returned to < 0.1%
- [ ] Document root cause in incident ticket
- [ ] Schedule post-mortem if P1 lasted > 30 min
- [ ] Update runbook if new failure mode discovered
