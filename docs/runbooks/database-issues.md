# Runbook: Database Issues

**Alert:** `SIEDatabaseSlow`  
**Severity:** P2  
**Trigger:** Database query P95 > 1s for 5+ minutes

---

## 1. Initial Assessment (2 min)

```bash
# Check database connectivity
kubectl exec -n sie deploy/sie-api -- python -c "
import asyncio, asyncpg, os
async def check():
    conn = await asyncpg.connect(os.environ['DATABASE_URL'], timeout=5)
    result = await conn.fetchval('SELECT 1')
    await conn.close()
    print('DB OK:', result)
asyncio.run(check())
"

# Check connection pool metrics
kubectl exec -n sie deploy/sie-api -- curl -s localhost:8000/metrics | grep -E "sie_db|connection"
```

## 2. Common Causes & Fixes

### 2.1 Connection Pool Exhaustion

**Symptoms:** `too many connections`, requests timing out

```bash
# Check active connections
kubectl exec -n sie deploy/sie-api -- psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';"
```

**Fix:**
```bash
# Increase pool size
kubectl set env deploy/sie-api -n sie DB_POOL_SIZE=50 DB_MAX_OVERFLOW=50

# Or restart to reset connections
kubectl rollout restart deploy/sie-api -n sie
```

### 2.2 Slow Queries

**Symptoms:** High P95 latency, specific endpoints slow

```bash
# Find slow queries (requires pg_stat_statements)
kubectl exec -n sie deploy/sie-api -- psql $DATABASE_URL -c "
SELECT query, calls, mean_exec_time, total_exec_time 
FROM pg_stat_statements 
ORDER BY mean_exec_time DESC 
LIMIT 10;
"
```

**Fix:**
- Add missing indexes
- Optimize query patterns
- Consider read replicas for heavy reads

### 2.3 Database Server Overloaded

**Symptoms:** All queries slow, high CPU/memory on DB server

```bash
# Check database server stats
kubectl exec -n sie deploy/sie-api -- psql $DATABASE_URL -c "
SELECT * FROM pg_stat_database WHERE datname = current_database();
"
```

**Fix:**
- Scale database (if managed)
- Enable connection pooler (PgBouncer)
- Reduce query volume

## 3. Emergency Procedures

### Read-Only Mode

If writes are causing issues:
```bash
# Temporarily disable write-heavy operations
kubectl scale deploy/sie-worker-ingestion -n sie --replicas=0
```

### Failover to Read Replica

```bash
# Point reads to replica
kubectl set env deploy/sie-api -n sie DATABASE_READ_URL=postgresql://replica-host:5432/sie
```

## 4. Resolution Checklist

- [ ] Query P95 returned to < 100ms
- [ ] Connection pool utilization < 80%
- [ ] No connection errors in logs
- [ ] Workers processing normally
