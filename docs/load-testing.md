# SIE Load Testing Guide

Performance testing procedures for the Smart Ingestion Engine.

## Prerequisites

```bash
# Install k6 load testing tool
brew install k6  # macOS
# or: apt install k6  # Linux

# Or use Docker
docker pull grafana/k6
```

## Test Scenarios

### 1. Baseline Test (Development)

```javascript
// k6/baseline.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 10,           // 10 virtual users
  duration: '1m',    // Run for 1 minute
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% under 500ms
    http_req_failed: ['rate<0.01'],    // <1% failure rate
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

export default function () {
  // Health check
  let res = http.get(`${BASE_URL}/health`);
  check(res, { 'health OK': (r) => r.status === 200 });

  // Submit ingestion job
  const payload = JSON.stringify({
    source_type: 'manual',
    content: 'Test content for load testing ' + Date.now(),
    metadata: { test: true }
  });

  res = http.post(`${BASE_URL}/ingest`, payload, {
    headers: { 
      'Content-Type': 'application/json',
      'X-API-Key': __ENV.API_KEY || 'test-api-key'
    },
  });
  check(res, { 'ingest accepted': (r) => r.status === 202 });

  sleep(1);
}
```

**Run:**
```bash
k6 run --env BASE_URL=http://localhost:8000 k6/baseline.js
```

### 2. Tier Load Tests

| Tier | VUs | RPS Target | Duration |
|------|-----|------------|----------|
| Starter | 10 | 5 | 5m |
| Pro | 100 | 50 | 10m |
| Enterprise | 500 | 500 | 15m |

```javascript
// k6/tier-pro.js
export const options = {
  stages: [
    { duration: '1m', target: 50 },   // Ramp up
    { duration: '8m', target: 50 },   // Steady state
    { duration: '1m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(99)<2000'],  // P99 < 2s per SLO
    http_req_failed: ['rate<0.001'],    // <0.1% error rate
  },
};
```

### 3. Spike Test

```javascript
// k6/spike.js
export const options = {
  stages: [
    { duration: '30s', target: 10 },   // Normal load
    { duration: '10s', target: 200 },  // Spike!
    { duration: '1m', target: 200 },   // Stay at spike
    { duration: '30s', target: 10 },   // Recovery
    { duration: '1m', target: 10 },    // Verify recovery
  ],
};
```

### 4. Soak Test (Long-running)

```bash
# Run for 4 hours at moderate load
k6 run --duration 4h --vus 25 k6/baseline.js
```

## Running Tests

### Local Development
```bash
# Start backend
cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000

# Run baseline test
k6 run --env BASE_URL=http://localhost:8000 k6/baseline.js
```

### Kubernetes
```bash
# Port-forward to service
kubectl port-forward -n sie svc/sie-api 8000:80

# Run test
k6 run --env BASE_URL=http://localhost:8000 --env API_KEY=$API_KEY k6/tier-pro.js
```

### CI/CD Integration
```yaml
# .github/workflows/load-test.yml
- name: Run Load Test
  run: |
    k6 run --out json=results.json k6/baseline.js
    
- name: Check thresholds
  run: |
    if grep -q '"thresholds":.*"failed":true' results.json; then
      exit 1
    fi
```

## Interpreting Results

### Key Metrics

| Metric | Target | Alert If |
|--------|--------|----------|
| `http_req_duration{p95}` | < 500ms | > 1s |
| `http_req_duration{p99}` | < 2s | > 5s |
| `http_req_failed` | < 0.1% | > 1% |
| `vus` | Stable | Dropping |

### Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| Increasing latency | Queue backup | Scale workers |
| 429 errors | Rate limiting | Check tier limits |
| 5xx errors | Service crash | Check logs, memory |
| Connection refused | Pod overload | Scale API pods |

## Performance Baselines

Document results after each major release:

| Version | RPS | P50 | P95 | P99 | Error % |
|---------|-----|-----|-----|-----|---------|
| v1.0.0 | 50 | 120ms | 450ms | 1.2s | 0.05% |
