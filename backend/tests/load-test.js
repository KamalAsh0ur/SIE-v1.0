/**
 * SIE Backend Load Test
 * 
 * k6 load testing script for performance validation.
 * Run with: k6 run load-test.js
 * 
 * Targets from SRS:
 * - 10,000 posts/hour baseline
 * - 50,000 posts/hour peak
 * - < 2s job acceptance
 * - < 500ms insight query (p95)
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const API_KEY = __ENV.API_KEY || 'dev-api-key-12345';

// Custom metrics
const jobAcceptanceTime = new Trend('job_acceptance_time');
const insightQueryTime = new Trend('insight_query_time');
const errorRate = new Rate('errors');

// Test configuration
export const options = {
    scenarios: {
        // Smoke test: Quick sanity check
        smoke: {
            executor: 'constant-vus',
            vus: 1,
            duration: '30s',
            startTime: '0s',
            exec: 'smokeTest',
        },

        // Load test: Normal load
        load: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '2m', target: 10 },  // Ramp up
                { duration: '5m', target: 10 },  // Stay at 10 VUs
                { duration: '2m', target: 20 },  // Ramp up more
                { duration: '5m', target: 20 },  // Stay at 20 VUs
                { duration: '2m', target: 0 },   // Ramp down
            ],
            startTime: '30s',
            exec: 'loadTest',
        },

        // Stress test: Push limits
        stress: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '1m', target: 50 },   // Aggressive ramp up
                { duration: '3m', target: 50 },   // Hold
                { duration: '1m', target: 100 },  // Peak
                { duration: '2m', target: 100 },  // Hold at peak
                { duration: '2m', target: 0 },    // Ramp down
            ],
            startTime: '17m',
            exec: 'stressTest',
        },
    },

    thresholds: {
        'job_acceptance_time': ['p95<2000'],  // < 2s (SRS requirement)
        'insight_query_time': ['p95<500'],    // < 500ms (SRS requirement)
        'errors': ['rate<0.05'],              // < 5% error rate
        'http_req_duration': ['p95<1000'],    // General p95 < 1s
    },
};

// Headers
const headers = {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
};

// ============================================================================
// Test Functions
// ============================================================================

export function smokeTest() {
    // Health check
    const healthRes = http.get(`${BASE_URL}/health`);
    check(healthRes, {
        'health: status 200': (r) => r.status === 200,
        'health: status healthy': (r) => JSON.parse(r.body).status === 'healthy',
    });

    sleep(1);
}

export function loadTest() {
    // Submit job
    const jobPayload = JSON.stringify({
        source_type: 'scraped',
        tenant: `load-test-${__VU}`,
        keywords: ['test', 'performance'],
        mode: 'realtime',
        priority: 'normal',
    });

    const startTime = Date.now();
    const submitRes = http.post(`${BASE_URL}/ingest`, jobPayload, { headers });
    const acceptanceTime = Date.now() - startTime;

    jobAcceptanceTime.add(acceptanceTime);

    const submitCheck = check(submitRes, {
        'submit: status 201': (r) => r.status === 201,
        'submit: has job_id': (r) => JSON.parse(r.body).job_id !== undefined,
        'submit: acceptance < 2s': () => acceptanceTime < 2000,
    });

    if (!submitCheck) {
        errorRate.add(1);
    }

    // List jobs
    const listRes = http.get(`${BASE_URL}/jobs?limit=10`, { headers });
    check(listRes, {
        'list: status 200': (r) => r.status === 200,
        'list: has jobs array': (r) => JSON.parse(r.body).jobs !== undefined,
    });

    sleep(1);
}

export function stressTest() {
    // High-volume job submission
    for (let i = 0; i < 5; i++) {
        const payload = JSON.stringify({
            source_type: 'scraped',
            tenant: `stress-test-${__VU}-${i}`,
            items: generateItems(10),  // 10 items per job
            mode: 'realtime',
            priority: 'high',
        });

        const res = http.post(`${BASE_URL}/ingest`, payload, { headers });

        const ok = check(res, {
            'stress: status 2xx': (r) => r.status >= 200 && r.status < 300,
        });

        if (!ok) {
            errorRate.add(1);
        }
    }

    // Insight queries
    const queryStart = Date.now();
    const insightRes = http.get(`${BASE_URL}/jobs?limit=50`, { headers });
    const queryTime = Date.now() - queryStart;

    insightQueryTime.add(queryTime);

    check(insightRes, {
        'query: status 200': (r) => r.status === 200,
        'query: response < 500ms': () => queryTime < 500,
    });

    sleep(0.5);
}

// ============================================================================
// Helpers
// ============================================================================

function generateItems(count) {
    const items = [];
    for (let i = 0; i < count; i++) {
        items.push({
            content: `Test content ${Date.now()}-${i} for load testing. This is some sample text that will be processed by the NLP pipeline.`,
            author: `test_user_${i}`,
            timestamp: new Date().toISOString(),
        });
    }
    return items;
}

// ============================================================================
// Summary
// ============================================================================

export function handleSummary(data) {
    return {
        'stdout': textSummary(data, { indent: '  ', enableColors: true }),
        'summary.json': JSON.stringify(data, null, 2),
    };
}

function textSummary(data, options) {
    // Custom summary output
    const { metrics } = data;

    let output = '\n=== SIE Load Test Summary ===\n\n';

    output += `Job Acceptance Time (p95): ${metrics.job_acceptance_time?.values?.['p(95)']?.toFixed(2) || 'N/A'}ms\n`;
    output += `Insight Query Time (p95): ${metrics.insight_query_time?.values?.['p(95)']?.toFixed(2) || 'N/A'}ms\n`;
    output += `Error Rate: ${((metrics.errors?.values?.rate || 0) * 100).toFixed(2)}%\n`;
    output += `Total Requests: ${metrics.http_reqs?.values?.count || 0}\n`;

    return output;
}
