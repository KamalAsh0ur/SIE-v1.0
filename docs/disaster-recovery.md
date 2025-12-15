# SIE Disaster Recovery Plan

Business continuity and disaster recovery procedures.

## Recovery Objectives

| Objective | Target | Notes |
|-----------|--------|-------|
| **RTO** (Recovery Time Objective) | 4 hours | Time to restore service |
| **RPO** (Recovery Point Objective) | 1 hour | Maximum data loss acceptable |

## Data Classification

| Data Type | Backup Frequency | Retention | Priority |
|-----------|------------------|-----------|----------|
| PostgreSQL (insights) | Hourly | 30 days | Critical |
| Redis (queues) | N/A (ephemeral) | - | Low |
| Meilisearch (index) | Daily | 7 days | Medium |
| Configuration | Git | Infinite | Critical |

## Backup Procedures

### Database (PostgreSQL)

**Managed (Supabase/RDS):**
- Automated daily backups
- Point-in-time recovery enabled
- Retention: 30 days

**Self-managed:**
```bash
# Daily backup script (cron)
pg_dump $DATABASE_URL | gzip > backup-$(date +%Y%m%d).sql.gz
aws s3 cp backup-*.sql.gz s3://sie-backups/postgres/
```

### Meilisearch Index

```bash
# Export index
curl -X POST "http://meilisearch:7700/dumps" -H "Authorization: Bearer $MEILI_KEY"

# Download dump
curl -O "http://meilisearch:7700/dumps/$(date +%Y%m%d).dump"
```

## Disaster Scenarios

### Scenario 1: Database Failure

**Detection:** 
- Alert: `SIEDatabaseSlow` or connection errors
- Health check: `/ready` returns `database: disconnected`

**Response:**
1. Switch to read replica (if available)
2. Restore from backup if replica unavailable
3. Notify users of potential data loss

**Recovery:**
```bash
# Restore from backup
gunzip -c backup-YYYYMMDD.sql.gz | psql $NEW_DATABASE_URL

# Update secret
kubectl create secret generic sie-secrets \
  --from-literal=database-url=$NEW_DATABASE_URL \
  --dry-run=client -o yaml | kubectl apply -f -

# Restart pods
kubectl rollout restart deploy/sie-api -n sie
```

### Scenario 2: Complete Cluster Failure

**Response:**
1. Provision new cluster (alternative region)
2. Restore from infrastructure-as-code
3. Restore database from cross-region backup

**Recovery:**
```bash
# Apply all manifests
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/hpa.yaml

# DNS failover to new cluster
# Update DNS records or use global load balancer
```

### Scenario 3: Data Corruption

**Detection:**
- User reports incorrect data
- Data validation failures

**Response:**
1. Identify corruption scope
2. Stop ingestion to prevent spread
3. Restore from last known good backup

```bash
# Stop new data ingestion
kubectl scale deploy/sie-worker-ingestion -n sie --replicas=0

# Identify corruption time
# Check logs, identify first bad record

# Point-in-time recovery (if available)
# Or restore from hourly backup
```

## Failover Procedures

### Active-Passive Failover

```
Primary (us-east-1)          Standby (us-west-2)
┌─────────────────┐          ┌─────────────────┐
│   SIE Cluster   │ ──sync── │   SIE Cluster   │
│   (ACTIVE)      │          │   (STANDBY)     │
└────────┬────────┘          └────────┬────────┘
         │                            │
         └──────── DNS ───────────────┘
                   │
            Global Load Balancer
```

**Failover trigger:**
1. Health checks fail for 5 minutes
2. Manual trigger by SRE

**Failover steps:**
1. Promote standby database to primary
2. Update DNS to point to standby
3. Scale up standby workers

## Communication Plan

| Audience | Channel | Update Frequency |
|----------|---------|------------------|
| Engineering | Slack #sie-incidents | Every 15 min |
| Stakeholders | Email | Hourly |
| Customers | Status page | On major changes |

## DR Testing Schedule

| Test Type | Frequency | Last Tested |
|-----------|-----------|-------------|
| Backup restore | Monthly | - |
| Failover drill | Quarterly | - |
| Full DR exercise | Annually | - |

## Post-Incident

1. Complete incident report within 24 hours
2. Update runbooks with lessons learned
3. Schedule postmortem meeting
4. Create tickets for preventive measures
