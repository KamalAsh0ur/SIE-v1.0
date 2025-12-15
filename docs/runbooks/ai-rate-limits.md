# Runbook: AI Rate Limits

**Alert:** AI 429 errors > 10/min  
**Severity:** P2  
**Trigger:** External AI API (Gemini/OpenAI) rate limiting

---

## 1. Initial Assessment (2 min)

```bash
# Check AI circuit breaker status
curl -s http://sie-api:8000/health/detailed | jq '.circuit_breakers[] | select(.name=="ai_service")'

# Check for 429 errors in logs
kubectl logs -n sie -l app.kubernetes.io/component=worker-nlp --tail=100 | grep -i "429\|rate"

# View AI metrics
kubectl exec -n sie deploy/sie-api -- curl -s localhost:8000/metrics | grep sie_ai
```

## 2. Common Causes

| Cause | Indicator |
|-------|-----------|
| Traffic spike | Queue depth increased recently |
| Quota exhausted | Consistent 429s across all requests |
| Single tenant abuse | 429s correlate with specific tenant |

## 3. Immediate Mitigation

### 3.1 Enable Request Throttling

Reduce the rate of AI calls by increasing batch sizes:

```bash
# Increase NLP batch size to reduce API calls
kubectl set env deploy/sie-worker-nlp -n sie NLP_BATCH_SIZE=200
```

### 3.2 Switch to Fallback Model

If using premium model, switch to faster/cheaper tier:

```bash
# Check current model
kubectl get deploy/sie-worker-nlp -n sie -o jsonpath='{.spec.template.spec.containers[0].env}'

# Switch to flash model
kubectl set env deploy/sie-worker-nlp -n sie AI_MODEL=gemini-1.5-flash
```

### 3.3 Circuit Breaker Activation

The circuit breaker will automatically:
1. Open after 5 failures → reject new AI calls
2. Return fallback results (neutral sentiment, no entities)
3. Retry after 60 seconds

Monitor via:
```bash
watch -n 5 'curl -s http://sie-api:8000/health/detailed | jq ".circuit_breakers"'
```

## 4. Long-term Fixes

1. **Increase API quota** with provider
2. **Add caching** for repeated content analysis
3. **Implement per-tenant AI quotas** to prevent abuse
4. **Use local models** (spaCy, VADER) as primary, AI as enhancement

## 5. Resolution Checklist

- [ ] 429 errors stopped or below threshold
- [ ] Circuit breaker back to CLOSED state
- [ ] Queue processing resumed normally
- [ ] Consider quota increase request
