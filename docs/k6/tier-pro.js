// SIE Backend - Pro Tier Load Test
// Simulates Pro tier customer load (100K mentions/day, 50 RPS target)
// Run: k6 run --env BASE_URL=http://localhost:8000 tier-pro.js

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Counter } from 'k6/metrics';

const errorRate = new Rate('errors');
const successfulIngests = new Counter('successful_ingests');

export const options = {
    stages: [
        { duration: '1m', target: 25 },   // Ramp up to half load
        { duration: '1m', target: 50 },   // Ramp to full Pro tier (50 RPS)
        { duration: '5m', target: 50 },   // Steady state at target
        { duration: '1m', target: 25 },   // Ramp down
        { duration: '30s', target: 0 },   // Cool down
    ],

    // SLO thresholds from SRE plan
    thresholds: {
        http_req_duration: ['p(50)<500', 'p(99)<2000'],  // P50 < 500ms, P99 < 2s
        http_req_failed: ['rate<0.001'],                  // < 0.1% error rate
        errors: ['rate<0.001'],
    },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const API_KEY = __ENV.API_KEY || 'test-api-key';

const headers = {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
};

// Simulate realistic social media content
const platforms = ['twitter', 'reddit', 'news', 'instagram'];
const sentiments = ['positive', 'negative', 'neutral'];

function generateContent() {
    const platform = platforms[Math.floor(Math.random() * platforms.length)];
    const words = Math.floor(Math.random() * 200) + 50;
    return {
        source_type: platform,
        content: `Pro tier test content with ${words} words. ` +
            'Lorem ipsum dolor sit amet. '.repeat(Math.floor(words / 5)),
        metadata: {
            tier: 'pro',
            platform: platform,
            expected_sentiment: sentiments[Math.floor(Math.random() * 3)],
            timestamp: new Date().toISOString(),
        },
    };
}

export default function () {
    group('Pro Tier Ingestion', function () {
        const payload = JSON.stringify(generateContent());

        const res = http.post(`${BASE_URL}/ingest`, payload, { headers });

        const success = check(res, {
            'ingest accepted': (r) => r.status === 202,
            'has job_id': (r) => r.json('job_id') !== undefined,
        });

        if (success) {
            successfulIngests.add(1);
        }
        errorRate.add(!success);
    });

    // 20% of requests also query insights
    if (Math.random() < 0.2) {
        group('Insights Query', function () {
            const res = http.get(`${BASE_URL}/insights?limit=20&offset=0`, { headers });
            check(res, {
                'insights ok': (r) => r.status === 200,
            });
        });
    }

    // Realistic pacing - ~50 RPS at 50 VUs means ~1 req/sec per VU
    sleep(1);
}

export function handleSummary(data) {
    const passed = Object.values(data.metrics)
        .filter(m => m.thresholds)
        .every(m => !Object.values(m.thresholds).some(t => t.ok === false));

    console.log('\n=== PRO TIER LOAD TEST ===');
    console.log(`Status: ${passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Successful ingests: ${data.metrics.successful_ingests?.values?.count || 0}`);
    console.log(`Error rate: ${(data.metrics.errors?.values?.rate * 100)?.toFixed(3)}%`);
    console.log(`P50: ${data.metrics.http_req_duration?.values?.['p(50)']?.toFixed(0)}ms`);
    console.log(`P99: ${data.metrics.http_req_duration?.values?.['p(99)']?.toFixed(0)}ms`);
    console.log('===========================\n');

    return {
        'tier-pro-results.json': JSON.stringify(data, null, 2),
    };
}
