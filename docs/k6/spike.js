// SIE Backend - Spike Test
// Simulates sudden traffic spikes to test auto-scaling and resilience
// Run: k6 run --env BASE_URL=http://localhost:8000 spike.js

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
    stages: [
        { duration: '30s', target: 10 },   // Normal load
        { duration: '10s', target: 100 },  // SPIKE! Rapid increase
        { duration: '1m', target: 100 },   // Stay at spike
        { duration: '30s', target: 10 },   // Rapid decrease
        { duration: '1m', target: 10 },    // Recovery period
    ],

    thresholds: {
        http_req_duration: ['p(99)<5000'],  // Relaxed for spike
        http_req_failed: ['rate<0.1'],      // Allow 10% during spike
        errors: ['rate<0.15'],
    },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const API_KEY = __ENV.API_KEY || 'test-api-key';

const headers = {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
};

export default function () {
    // Quick health check
    let res = http.get(`${BASE_URL}/health`);
    errorRate.add(res.status !== 200);

    // Main ingestion workload
    const payload = JSON.stringify({
        source_type: 'manual',
        content: `Spike test ${Date.now()}`,
        metadata: { spike_test: true },
    });

    res = http.post(`${BASE_URL}/ingest`, payload, { headers });

    check(res, {
        'spike: request succeeded': (r) => r.status === 202 || r.status === 429,
    });

    // 429 is acceptable during spike (rate limiting working)
    errorRate.add(res.status !== 202 && res.status !== 429);

    sleep(0.5);
}

export function handleSummary(data) {
    console.log('\n=== SPIKE TEST RESULTS ===');
    console.log(`Max VUs reached: ${data.metrics.vus_max?.values?.max || 'N/A'}`);
    console.log(`Total requests: ${data.metrics.http_reqs?.values?.count || 0}`);
    console.log(`Error rate: ${(data.metrics.errors?.values?.rate * 100)?.toFixed(2)}%`);
    console.log(`P99 latency: ${data.metrics.http_req_duration?.values?.['p(99)']?.toFixed(0)}ms`);
    console.log('========================\n');

    return {
        'spike-results.json': JSON.stringify(data, null, 2),
    };
}
