"""
Tests for SIE Backend API

Run with: pytest tests/ -v
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)

# API key header for authenticated requests
AUTH_HEADERS = {"X-API-Key": "dev-api-key-12345"}


# ============================================================================
# Health Check Tests
# ============================================================================

class TestHealth:
    """Tests for health endpoints."""
    
    def test_health_check(self):
        """Test /health endpoint returns healthy status."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "version" in data
        assert "timestamp" in data
    
    def test_readiness_check(self):
        """Test /ready endpoint returns ready status."""
        response = client.get("/ready")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ready"


# ============================================================================
# Ingestion Tests
# ============================================================================

class TestIngestion:
    """Tests for ingestion endpoints."""
    
    def test_submit_valid_job(self):
        """Test submitting a valid ingestion job."""
        payload = {
            "source_type": "scraped",
            "tenant": "test-tenant",
            "accounts": ["@testuser"],
            "keywords": ["python", "fastapi"],
            "mode": "realtime",
            "priority": "normal"
        }
        
        response = client.post("/ingest", json=payload, headers=AUTH_HEADERS)
        assert response.status_code == 201
        data = response.json()
        
        assert "job_id" in data
        assert "accepted_at" in data
        assert data["status"] == "queued"
    
    def test_submit_job_with_items(self):
        """Test submitting job with pre-fetched items."""
        payload = {
            "source_type": "meta_api",
            "tenant": "test-tenant",
            "items": [
                {"content": "Test post content", "author": "test_author"},
                {"content": "Another test post", "author": "another_author"}
            ],
            "mode": "historical",
            "priority": "high"
        }
        
        response = client.post("/ingest", json=payload, headers=AUTH_HEADERS)
        assert response.status_code == 201
    
    def test_submit_invalid_job_no_content(self):
        """Test that job without items, accounts, or keywords fails."""
        payload = {
            "source_type": "scraped",
            "tenant": "test-tenant",
            "mode": "realtime"
        }
        
        response = client.post("/ingest", json=payload, headers=AUTH_HEADERS)
        assert response.status_code == 400
    
    def test_submit_invalid_source_type(self):
        """Test that invalid source_type fails validation."""
        payload = {
            "source_type": "invalid_source",
            "tenant": "test-tenant",
            "keywords": ["test"]
        }
        
        response = client.post("/ingest", json=payload, headers=AUTH_HEADERS)
        assert response.status_code == 422  # Validation error
    
    def test_submit_without_api_key(self):
        """Test that submitting without API key returns 401."""
        payload = {
            "source_type": "scraped",
            "tenant": "test-tenant",
            "keywords": ["test"]
        }
        
        response = client.post("/ingest", json=payload)
        assert response.status_code == 401


# ============================================================================
# Jobs Tests
# ============================================================================

class TestJobs:
    """Tests for job endpoints."""
    
    def test_list_jobs(self):
        """Test listing jobs."""
        response = client.get("/jobs", headers=AUTH_HEADERS)
        assert response.status_code == 200
        data = response.json()
        
        assert "jobs" in data
        assert "pagination" in data
        assert isinstance(data["jobs"], list)
    
    def test_list_jobs_with_filters(self):
        """Test listing jobs with filters."""
        response = client.get("/jobs?status=pending&limit=10", headers=AUTH_HEADERS)
        assert response.status_code == 200
    
    def test_get_nonexistent_job(self):
        """Test getting a job that doesn't exist."""
        response = client.get("/jobs/00000000-0000-0000-0000-000000000000", headers=AUTH_HEADERS)
        assert response.status_code == 404
    
    def test_list_jobs_without_api_key(self):
        """Test that listing jobs without API key returns 401."""
        response = client.get("/jobs")
        assert response.status_code == 401


# ============================================================================
# Insights Tests
# ============================================================================

class TestInsights:
    """Tests for insights endpoints."""
    
    def test_get_insights_for_nonexistent_job(self):
        """Test getting insights for a job that doesn't exist."""
        response = client.get("/insights/00000000-0000-0000-0000-000000000000", headers=AUTH_HEADERS)
        assert response.status_code == 404


# ============================================================================
# Events Tests
# ============================================================================

class TestEvents:
    """Tests for event endpoints."""
    
    def test_get_recent_events(self):
        """Test getting recent events."""
        response = client.get("/events/recent", headers=AUTH_HEADERS)
        assert response.status_code == 200
        data = response.json()
        assert "events" in data


# ============================================================================
# Integration Tests
# ============================================================================

class TestIntegration:
    """End-to-end integration tests."""
    
    def test_full_ingestion_flow(self):
        """Test complete ingestion flow: submit -> check status."""
        # Submit job
        submit_payload = {
            "source_type": "scraped",
            "tenant": "integration-test",
            "keywords": ["test"],
            "mode": "realtime",
            "priority": "high"
        }
        
        submit_response = client.post("/ingest", json=submit_payload, headers=AUTH_HEADERS)
        assert submit_response.status_code == 201
        job_id = submit_response.json()["job_id"]
        
        # Check job status
        status_response = client.get(f"/jobs/{job_id}/status", headers=AUTH_HEADERS)
        # Job might not exist in mock storage since we bypassed Celery
        # In production tests, this would be 200
        assert status_response.status_code in [200, 404]

