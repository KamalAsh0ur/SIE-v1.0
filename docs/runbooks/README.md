# SIE Runbooks

Incident response procedures for the Smart Ingestion Engine (SIE) backend.

## Available Runbooks

| Runbook | Trigger Alert | Priority |
|---------|---------------|----------|
| [High Error Rate](./high-error-rate.md) | `SIEHighErrorRate` | P1 |
| [Queue Backup](./queue-backup.md) | `SIEQueueStagnation` | P2 |
| [AI Rate Limits](./ai-rate-limits.md) | AI 429 errors > 10/min | P2 |
| [Database Issues](./database-issues.md) | `SIEDatabaseSlow` | P2 |
| [Memory OOM](./memory-oom.md) | Pod restarts, OOMKilled | P1 |

## Incident Severity Levels

| Level | Response Time | Examples |
|-------|---------------|----------|
| **P1** | 15 min | Service down, data loss risk |
| **P2** | 1 hour | Degraded performance, queues backing up |
| **P3** | 4 hours | Non-critical alerts, monitoring |

## On-Call Escalation

1. Primary on-call responds within SLA
2. If no response in 15 min → escalate to secondary
3. If P1 unresolved in 1 hour → escalate to engineering lead
