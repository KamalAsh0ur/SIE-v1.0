# Runbook: Memory OOM

**Alert:** Pod restarts with OOMKilled, memory > 90%  
**Severity:** P1  
**Trigger:** Container killed by OOM killer

---

## 1. Initial Assessment (2 min)

```bash
# Check for OOMKilled pods
kubectl get pods -n sie -o wide | grep -E "OOMKilled|CrashLoopBackOff"

# Check pod restart count
kubectl get pods -n sie -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.containerStatuses[0].restartCount}{"\n"}{end}'

# View termination reason
kubectl describe pod -n sie <pod-name> | grep -A5 "Last State"
```

## 2. Identify Memory Consumer

```bash
# Check current memory usage
kubectl top pods -n sie --sort-by=memory

# View memory metrics
kubectl exec -n sie deploy/sie-api -- curl -s localhost:8000/metrics | grep sie_memory
```

### Common Memory Hogs

| Component | Typical Cause |
|-----------|---------------|
| API pods | Large response payloads, memory leaks |
| NLP workers | Large text processing, model loading |
| OCR workers | Image processing, EasyOCR model |

## 3. Immediate Mitigation

### 3.1 Increase Memory Limits

```bash
# Patch deployment with higher limits
kubectl patch deploy/sie-worker-nlp -n sie -p '{
  "spec": {
    "template": {
      "spec": {
        "containers": [{
          "name": "worker",
          "resources": {
            "limits": {"memory": "4Gi"},
            "requests": {"memory": "2Gi"}
          }
        }]
      }
    }
  }
}'
```

### 3.2 Reduce Batch Sizes

```bash
# Smaller batches = less memory
kubectl set env deploy/sie-worker-nlp -n sie NLP_BATCH_SIZE=50
kubectl set env deploy/sie-worker-ocr -n sie OCR_BATCH_SIZE=5
```

### 3.3 Scale Horizontally

More pods with lower limits instead of fewer with high limits:

```bash
# Double pods, halve memory each
kubectl scale deploy/sie-worker-nlp -n sie --replicas=4
kubectl patch deploy/sie-worker-nlp -n sie -p '{"spec":{"template":{"spec":{"containers":[{"name":"worker","resources":{"limits":{"memory":"1Gi"}}}]}}}}'
```

## 4. Root Cause Investigation

### Check for Memory Leaks

```bash
# Enable memory profiling (restart required)
kubectl set env deploy/sie-api -n sie PYTHONTRACEMALLOC=1

# After restart, trigger profiling endpoint (if implemented)
kubectl exec -n sie deploy/sie-api -- curl localhost:8000/debug/memory
```

### Review Recent Changes

- New dependencies with high memory usage?
- Changed batch sizes or concurrency?
- New data types being processed?

## 5. Prevention

1. **Set appropriate limits** based on profiling
2. **Monitor memory trends** in Grafana
3. **Implement pagination** for large responses
4. **Use streaming** for large file processing
5. **Regular garbage collection** for long-running workers

## 6. Resolution Checklist

- [ ] Pods stable (no OOMKilled in last 30 min)
- [ ] Memory usage < 80% of limits
- [ ] Identified root cause
- [ ] Created ticket for permanent fix
