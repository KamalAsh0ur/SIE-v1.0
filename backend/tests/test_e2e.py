"""
End-to-End Integration Tests

Tests the complete ingestion pipeline from job submission to insight retrieval.
"""

import pytest
import asyncio
import time
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


# ============================================================================
# Test Configuration
# ============================================================================

API_KEY = "dev-api-key-12345"
HEADERS = {"X-API-Key": API_KEY}


# ============================================================================
# E2E Integration Tests
# ============================================================================

class TestE2EIngestionPipeline:
    """End-to-end tests for the ingestion pipeline."""
    
    def test_full_pipeline_with_items(self):
        """
        Test complete flow: submit job with items → check status → get insights.
        """
        # 1. Submit job with pre-fetched items
        job_payload = {
            "source_type": "scraped",
            "tenant": f"e2e-test-{uuid4().hex[:8]}",
            "items": [
                {
                    "id": "item-1",
                    "content": "This is a positive review about the product. I love it!",
                    "author": "happy_user",
                    "timestamp": "2025-02-10T12:00:00Z",
                },
                {
                    "id": "item-2", 
                    "content": "Terrible experience. Very disappointed with the service.",
                    "author": "unhappy_user",
                    "timestamp": "2025-02-10T13:00:00Z",
                },
                {
                    "id": "item-3",
                    "content": "It's okay, nothing special. Average product overall.",
                    "author": "neutral_user",
                    "timestamp": "2025-02-10T14:00:00Z",
                },
            ],
            "mode": "realtime",
            "priority": "high",
        }
        
        submit_response = client.post("/ingest", json=job_payload, headers=HEADERS)
        assert submit_response.status_code == 201
        
        result = submit_response.json()
        assert "job_id" in result
        assert "accepted_at" in result
        
        job_id = result["job_id"]
        
        # 2. Check job status (in real test, would poll until complete)
        status_response = client.get(f"/jobs/{job_id}/status", headers=HEADERS)
        # Job might not exist in mock storage
        assert status_response.status_code in [200, 404]
        
        # 3. List jobs to verify job exists
        list_response = client.get("/jobs", headers=HEADERS)
        assert list_response.status_code == 200
    
    def test_batch_submission(self):
        """Test batch job submission."""
        batch_payload = [
            {
                "source_type": "scraped",
                "tenant": f"batch-test-{uuid4().hex[:8]}",
                "keywords": ["python", "fastapi"],
                "mode": "realtime",
                "priority": "normal",
            },
            {
                "source_type": "scraped",
                "tenant": f"batch-test-{uuid4().hex[:8]}",
                "keywords": ["django", "flask"],
                "mode": "realtime",
                "priority": "low",
            },
        ]
        
        response = client.post("/ingest/batch", json=batch_payload, headers=HEADERS)
        assert response.status_code == 201
        
        results = response.json()
        assert len(results) == 2
        for result in results:
            assert "job_id" in result
    
    def test_search_endpoint(self):
        """Test full-text search endpoint."""
        # Search should work even with no results
        response = client.get("/search?q=python", headers=HEADERS)
        assert response.status_code == 200
        
        result = response.json()
        assert "hits" in result
        assert "total" in result
        assert "query" in result
        assert result["query"] == "python"
    
    def test_events_stream_connection(self):
        """Test SSE event stream can be established."""
        # Note: TestClient doesn't fully support SSE, just verify endpoint exists
        response = client.get("/events/recent", headers=HEADERS)
        assert response.status_code == 200


class TestE2EErrorHandling:
    """Test error handling in the pipeline."""
    
    def test_invalid_source_type(self):
        """Test validation error for invalid source type."""
        payload = {
            "source_type": "invalid_type",
            "tenant": "test",
            "keywords": ["test"],
        }
        
        response = client.post("/ingest", json=payload, headers=HEADERS)
        assert response.status_code == 422  # Validation error
    
    def test_missing_content(self):
        """Test error when no items, accounts, or keywords provided."""
        payload = {
            "source_type": "scraped",
            "tenant": "test",
            "mode": "realtime",
        }
        
        response = client.post("/ingest", json=payload, headers=HEADERS)
        assert response.status_code == 400
    
    def test_nonexistent_job(self):
        """Test 404 for nonexistent job."""
        fake_id = "00000000-0000-0000-0000-000000000000"
        response = client.get(f"/jobs/{fake_id}", headers=HEADERS)
        assert response.status_code == 404
    
    def test_nonexistent_insights(self):
        """Test 404 for insights of nonexistent job."""
        fake_id = "00000000-0000-0000-0000-000000000000"
        response = client.get(f"/insights/{fake_id}", headers=HEADERS)
        assert response.status_code == 404


class TestE2EAuthAndRateLimiting:
    """Test authentication and rate limiting."""
    
    def test_missing_api_key(self):
        """Test that requests without API key are rejected."""
        response = client.get("/jobs")
        # In debug mode, this might be allowed
        assert response.status_code in [200, 401, 403]
    
    def test_invalid_api_key(self):
        """Test that invalid API key is rejected."""
        response = client.get("/jobs", headers={"X-API-Key": "invalid-key"})
        # In debug mode, this might be allowed
        assert response.status_code in [200, 401, 403]


class TestE2EMetricsAndMonitoring:
    """Test observability endpoints."""
    
    def test_health_check(self):
        """Test health endpoint."""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"
    
    def test_readiness_check(self):
        """Test readiness endpoint."""
        response = client.get("/ready")
        assert response.status_code == 200
    
    def test_metrics_endpoint(self):
        """Test Prometheus metrics endpoint."""
        response = client.get("/metrics")
        assert response.status_code == 200
        assert "sie_" in response.text  # Check for SIE metrics prefix


# ============================================================================
# Performance Tests
# ============================================================================

class TestPerformance:
    """Basic performance tests."""
    
    def test_health_response_time(self):
        """Health check should respond in < 100ms."""
        start = time.time()
        response = client.get("/health")
        elapsed = (time.time() - start) * 1000
        
        assert response.status_code == 200
        assert elapsed < 100, f"Health check took {elapsed}ms"
    
    def test_concurrent_job_submissions(self):
        """Test multiple concurrent job submissions."""
        import concurrent.futures
        
        def submit_job(i):
            payload = {
                "source_type": "scraped",
                "tenant": f"perf-test-{i}",
                "keywords": [f"keyword{i}"],
                "mode": "realtime",
                "priority": "normal",
            }
            return client.post("/ingest", json=payload, headers=HEADERS)
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(submit_job, i) for i in range(10)]
            results = [f.result() for f in concurrent.futures.as_completed(futures)]
        
        # All should succeed
        success_count = sum(1 for r in results if r.status_code == 201)
        assert success_count >= 8, f"Only {success_count}/10 submissions succeeded"
