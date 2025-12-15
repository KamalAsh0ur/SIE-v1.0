// SIE Backend - Baseline Load Test
// Run: k6 run --env BASE_URL=http://localhost:8000 baseline.js

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const ingestLatency = new Trend('ingest_latency');
const healthLatency = new Trend('health_latency');

// Test configuration
export const options = {
    vus: 10,                    // 10 virtual users
    duration: '2m',             // Run for 2 minutes

    thresholds: {
        http_req_duration: ['p(95)<500', 'p(99)<2000'],  // SLO targets
        http_req_failed: ['rate<0.01'],                   // <1% errors
        errors: ['rate<0.05'],                            // Custom error rate
    },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const API_KEY = __ENV.API_KEY || 'test-api-key';

const headers = {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
};

export default function () {
    group('Health Checks', function () {
        // Liveness probe
        let res = http.get(`${BASE_URL}/health`);
        check(res, {
            'health status 200': (r) => r.status === 200,
            'health returns healthy': (r) => r.json('status') === 'healthy',
        });
        healthLatency.add(res.timings.duration);
        errorRate.add(res.status !== 200);

        // Readiness probe
        res = http.get(`${BASE_URL}/ready`);
        check(res, {
            'ready status 200': (r) => r.status === 200,
        });
    });

    group('Ingestion Flow', function () {
        // Submit an ingestion job
        const payload = JSON.stringify({
            source_type: 'manual',
            content: `Load test content - ${Date.now()} - ${Math.random().toString(36)}`,
            metadata: {
                test: true,
                timestamp: new Date().toISOString(),
            },
        });

        const res = http.post(`${BASE_URL}/ingest`, payload, { headers });

        check(res, {
            'ingest accepted (202)': (r) => r.status === 202,
            'ingest returns job_id': (r) => r.json('job_id') !== undefined,
        });

        ingestLatency.add(res.timings.duration);
        errorRate.add(res.status !== 202);

        // If we got a job ID, check its status
        if (res.status === 202) {
            const jobId = res.json('job_id');
            sleep(0.5);

            const statusRes = http.get(`${BASE_URL}/jobs/${jobId}`, { headers });
            check(statusRes, {
                'job status retrieved': (r) => r.status === 200,
            });
        }
    });

    group('Insights Query', function () {
        const res = http.get(`${BASE_URL}/insights?limit=10`, { headers });
        check(res, {
            'insights status 200': (r) => r.status === 200,
        });
    });

    // Pace the requests
    sleep(1);
}

// Summary handler
export function handleSummary(data) {
    return {
        'stdout': textSummary(data, { indent: ' ', enableColors: true }),
        'summary.json': JSON.stringify(data, null, 2),
    };
}

function textSummary(data, options) {
    const metrics = data.metrics;
    return `
SIE Load Test Summary
=====================
Duration: ${data.state.testRunDurationMs}ms
VUs: ${options.vus || data.options?.vus || 'N/A'}

Requests:
  Total: ${metrics.http_reqs?.values?.count || 0}
  Failed: ${metrics.http_req_failed?.values?.rate?.toFixed(4) || 0}

Latency:
  P50: ${metrics.http_req_duration?.values?.['p(50)']?.toFixed(2)}ms
  P95: ${metrics.http_req_duration?.values?.['p(95)']?.toFixed(2)}ms
  P99: ${metrics.http_req_duration?.values?.['p(99)']?.toFixed(2)}ms

Custom Metrics:
  Error Rate: ${metrics.errors?.values?.rate?.toFixed(4) || 0}
  Ingest P95: ${metrics.ingest_latency?.values?.['p(95)']?.toFixed(2)}ms
`;
}
