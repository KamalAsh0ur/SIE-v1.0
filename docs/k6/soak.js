// SIE Backend - Soak Test
// Long-running test to find memory leaks and degradation
// Run: k6 run --env BASE_URL=http://localhost:8000 soak.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Gauge } from 'k6/metrics';

const errorRate = new Rate('errors');
const memoryTrend = new Trend('memory_usage');

export const options = {
    stages: [
        { duration: '5m', target: 20 },    // Ramp up
        { duration: '2h', target: 20 },    // SOAK: 2 hours at steady load
        { duration: '5m', target: 0 },     // Ramp down
    ],

    thresholds: {
        http_req_duration: ['p(99)<2000'],
        http_req_failed: ['rate<0.01'],
        errors: ['rate<0.01'],
    },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const API_KEY = __ENV.API_KEY || 'test-api-key';

const headers = {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
};

let iteration = 0;

export default function () {
    iteration++;

    // Health check every 100 iterations
    if (iteration % 100 === 0) {
        const res = http.get(`${BASE_URL}/health/detailed`);
        if (res.status === 200) {
            // Track memory if available in metrics
            const body = res.json();
            console.log(`[Iteration ${iteration}] Uptime: ${body.uptime_seconds}s`);
        }
    }

    // Normal ingestion workload
    const payload = JSON.stringify({
        source_type: 'twitter',
        content: `Soak test iteration ${iteration} - ${Date.now()}`,
        metadata: { soak_test: true, iteration: iteration },
    });

    const res = http.post(`${BASE_URL}/ingest`, payload, { headers });

    check(res, {
        'soak: accepted': (r) => r.status === 202,
    });

    errorRate.add(res.status !== 202);

    sleep(2);  // Slower pace for soak test
}

export function handleSummary(data) {
    console.log('\n=== SOAK TEST SUMMARY ===');
    console.log(`Duration: ${(data.state.testRunDurationMs / 1000 / 60).toFixed(1)} minutes`);
    console.log(`Total requests: ${data.metrics.http_reqs?.values?.count || 0}`);
    console.log(`Error rate: ${(data.metrics.errors?.values?.rate * 100)?.toFixed(3)}%`);
    console.log(`P50: ${data.metrics.http_req_duration?.values?.['p(50)']?.toFixed(0)}ms`);
    console.log(`P99: ${data.metrics.http_req_duration?.values?.['p(99)']?.toFixed(0)}ms`);
    console.log('=========================\n');

    // Check for latency degradation
    const p99 = data.metrics.http_req_duration?.values?.['p(99)'] || 0;
    if (p99 > 1500) {
        console.log('⚠️ WARNING: P99 latency degraded during soak test');
    }

    return {
        'soak-results.json': JSON.stringify(data, null, 2),
    };
}
