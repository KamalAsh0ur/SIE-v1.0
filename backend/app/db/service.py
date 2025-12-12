"""
Database Service

Provides async database operations for job and insight persistence.
Uses asyncpg for PostgreSQL connectivity.
"""

import json
from datetime import datetime
from typing import Optional, List, Dict, Any
from uuid import UUID

try:
    import asyncpg
    ASYNCPG_AVAILABLE = True
except ImportError:
    ASYNCPG_AVAILABLE = False

from app.config import settings


class DatabaseService:
    """
    Async database service for SIE job and insight storage.
    
    Falls back to in-memory storage if PostgreSQL is unavailable.
    """
    
    def __init__(self):
        self._pool: Optional[asyncpg.Pool] = None
        self._connected = False
        # In-memory fallback
        self._jobs: Dict[str, Dict] = {}
        self._insights: Dict[str, List[Dict]] = {}
    
    async def connect(self) -> bool:
        """Initialize database connection pool."""
        if not ASYNCPG_AVAILABLE:
            print("⚠ asyncpg not available, using in-memory storage")
            return False
        
        try:
            self._pool = await asyncpg.create_pool(
                settings.database_url,
                min_size=5,
                max_size=settings.db_pool_size,
                command_timeout=60,
            )
            self._connected = True
            print("✓ Database connection pool established")
            return True
        except Exception as e:
            print(f"⚠ Database connection failed: {e}")
            return False
    
    async def disconnect(self):
        """Close database connection pool."""
        if self._pool:
            await self._pool.close()
            self._connected = False
    
    @property
    def is_connected(self) -> bool:
        return self._connected and self._pool is not None
    
    # =========================================================================
    # Job Operations
    # =========================================================================
    
    async def create_job(
        self,
        job_id: str,
        tenant: str,
        source_type: str,
        mode: str = "realtime",
        priority: str = "normal",
        accounts: List[str] = None,
        keywords: List[str] = None,
        date_range: Dict = None,
    ) -> Dict:
        """Create a new ingestion job."""
        job = {
            "id": job_id,
            "tenant": tenant,
            "source_type": source_type,
            "status": "pending",
            "mode": mode,
            "priority": priority,
            "accounts": accounts or [],
            "keywords": keywords or [],
            "date_range": date_range,
            "items_total": 0,
            "items_processed": 0,
            "progress_percent": 0,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
        }
        
        if self.is_connected:
            try:
                await self._pool.execute("""
                    INSERT INTO ingestion_jobs 
                    (id, tenant, source_type, status, mode, priority, accounts, keywords, date_range)
                    VALUES ($1, $2, $3::platform_type, 'pending'::job_status, $4, $5::job_priority, $6, $7, $8)
                """,
                    UUID(job_id),
                    tenant,
                    source_type,
                    mode,
                    priority,
                    accounts,
                    keywords,
                    json.dumps(date_range) if date_range else None,
                )
            except Exception as e:
                print(f"DB create_job error: {e}")
                # Fall back to in-memory
                self._jobs[job_id] = job
        else:
            self._jobs[job_id] = job
        
        return job
    
    async def get_job(self, job_id: str) -> Optional[Dict]:
        """Get job by ID."""
        if self.is_connected:
            try:
                row = await self._pool.fetchrow(
                    "SELECT * FROM ingestion_jobs WHERE id = $1",
                    UUID(job_id)
                )
                if row:
                    return dict(row)
            except Exception as e:
                print(f"DB get_job error: {e}")
        
        return self._jobs.get(job_id)
    
    async def update_job_status(
        self,
        job_id: str,
        status: str,
        progress: int = None,
        items_total: int = None,
        items_processed: int = None,
        error_message: str = None,
        processing_time_ms: int = None,
    ) -> bool:
        """Update job status and progress."""
        updates = {"status": status, "updated_at": datetime.utcnow().isoformat()}
        
        if progress is not None:
            updates["progress_percent"] = progress
        if items_total is not None:
            updates["items_total"] = items_total
        if items_processed is not None:
            updates["items_processed"] = items_processed
        if error_message is not None:
            updates["error_message"] = error_message
        if processing_time_ms is not None:
            updates["processing_time_ms"] = processing_time_ms
        
        if status == "ingesting":
            updates["started_at"] = datetime.utcnow().isoformat()
        elif status in ["completed", "failed"]:
            updates["completed_at"] = datetime.utcnow().isoformat()
        
        if self.is_connected:
            try:
                await self._pool.execute("""
                    UPDATE ingestion_jobs 
                    SET status = $2::job_status, 
                        progress_percent = COALESCE($3, progress_percent),
                        items_total = COALESCE($4, items_total),
                        items_processed = COALESCE($5, items_processed),
                        error_message = COALESCE($6, error_message),
                        processing_time_ms = COALESCE($7, processing_time_ms),
                        started_at = CASE WHEN $2 = 'ingesting' THEN NOW() ELSE started_at END,
                        completed_at = CASE WHEN $2 IN ('completed', 'failed') THEN NOW() ELSE completed_at END
                    WHERE id = $1
                """,
                    UUID(job_id),
                    status,
                    progress,
                    items_total,
                    items_processed,
                    error_message,
                    processing_time_ms,
                )
                return True
            except Exception as e:
                print(f"DB update_job_status error: {e}")
        
        # In-memory fallback
        if job_id in self._jobs:
            self._jobs[job_id].update(updates)
            return True
        return False
    
    async def list_jobs(
        self,
        tenant: str = None,
        status: str = None,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[List[Dict], int]:
        """List jobs with optional filtering."""
        if self.is_connected:
            try:
                query = "SELECT * FROM ingestion_jobs WHERE 1=1"
                count_query = "SELECT COUNT(*) FROM ingestion_jobs WHERE 1=1"
                params = []
                
                if tenant:
                    params.append(tenant)
                    query += f" AND tenant = ${len(params)}"
                    count_query += f" AND tenant = ${len(params)}"
                
                if status:
                    params.append(status)
                    query += f" AND status = ${len(params)}::job_status"
                    count_query += f" AND status = ${len(params)}::job_status"
                
                query += " ORDER BY created_at DESC"
                query += f" LIMIT {limit} OFFSET {offset}"
                
                rows = await self._pool.fetch(query, *params)
                count = await self._pool.fetchval(count_query, *params)
                
                return [dict(row) for row in rows], count
            except Exception as e:
                print(f"DB list_jobs error: {e}")
        
        # In-memory fallback
        jobs = list(self._jobs.values())
        if tenant:
            jobs = [j for j in jobs if j.get("tenant") == tenant]
        if status:
            jobs = [j for j in jobs if j.get("status") == status]
        
        jobs.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        return jobs[offset:offset+limit], len(jobs)
    
    async def cleanup_old_jobs(self, max_age_hours: int = None) -> int:
        """
        Remove jobs older than max_age_hours to prevent unbounded memory growth.
        
        Returns: Number of jobs removed
        """
        from datetime import timedelta
        
        if max_age_hours is None:
            max_age_hours = settings.job_ttl_hours
        
        cutoff = datetime.utcnow() - timedelta(hours=max_age_hours)
        cutoff_iso = cutoff.isoformat()
        
        if self.is_connected:
            try:
                result = await self._pool.execute("""
                    DELETE FROM ingestion_jobs 
                    WHERE created_at < $1 
                    AND status IN ('completed', 'failed')
                """, cutoff)
                # Also clean up orphaned insights
                await self._pool.execute("""
                    DELETE FROM insights 
                    WHERE job_id NOT IN (SELECT id FROM ingestion_jobs)
                """)
                return int(result.split()[-1]) if result else 0
            except Exception as e:
                print(f"DB cleanup error: {e}")
        
        # In-memory cleanup
        old_count = len(self._jobs)
        self._jobs = {
            k: v for k, v in self._jobs.items()
            if v.get("created_at", "") > cutoff_iso or v.get("status") not in ["completed", "failed"]
        }
        # Clean up insights for removed jobs
        job_ids = set(self._jobs.keys())
        self._insights = {k: v for k, v in self._insights.items() if k in job_ids}
        
        return old_count - len(self._jobs)
    
    async def store_insights_batch(self, job_id: str, insights: List[Dict]) -> bool:
        """
        Store multiple insights in a single transaction.
        
        Prevents partial failures leaving database in inconsistent state.
        """
        if self.is_connected:
            try:
                async with self._pool.acquire() as conn:
                    async with conn.transaction():
                        for insight in insights:
                            await conn.execute("""
                                INSERT INTO insights 
                                (job_id, tenant, post_id, content_text, sentiment, 
                                 sentiment_score, entities, topics, keywords, language,
                                 source_url, platform, fetch_method)
                                VALUES ($1, $2, $3, $4, $5::sentiment_type, $6, $7, $8, 
                                        $9, $10, $11, $12, $13)
                            """,
                                UUID(job_id),
                                insight.get("tenant"),
                                insight.get("post_id"),
                                insight.get("content_text", ""),
                                insight.get("sentiment", "neutral"),
                                insight.get("sentiment_score", 0),
                                json.dumps(insight.get("entities", [])),
                                insight.get("topics", []),
                                insight.get("keywords", []),
                                insight.get("language", "en"),
                                insight.get("source_url", ""),
                                insight.get("platform", "unknown"),
                                insight.get("fetch_method", "scraper"),
                            )
                return True
            except Exception as e:
                print(f"DB batch insert error: {e}")
                return False
        
        # In-memory fallback
        if job_id not in self._insights:
            self._insights[job_id] = []
        self._insights[job_id].extend(insights)
        return True
    
    # =========================================================================
    # Insight Operations
    # =========================================================================
    
    async def store_insight(self, job_id: str, insight: Dict) -> bool:
        """Store a processed insight."""
        if self.is_connected:
            try:
                await self._pool.execute("""
                    INSERT INTO insights 
                    (job_id, tenant, post_id, content_text, ocr_text, author_name,
                     sentiment, sentiment_score, entities, topics, keywords, language,
                     source_url, platform, fetch_method, original_id, 
                     confidence_scores, is_spam, is_duplicate)
                    VALUES ($1, $2, $3, $4, $5, $6, $7::sentiment_type, $8, $9, $10, 
                            $11, $12, $13, $14, $15, $16, $17, $18, $19)
                """,
                    UUID(job_id),
                    insight.get("tenant"),
                    insight.get("post_id"),
                    insight.get("content_text", ""),
                    insight.get("ocr_text"),
                    insight.get("author"),
                    insight.get("sentiment", "neutral"),
                    insight.get("sentiment_score", 0),
                    json.dumps(insight.get("entities", [])),
                    insight.get("topics", []),
                    insight.get("keywords", []),
                    insight.get("language", "en"),
                    insight.get("source_url", ""),
                    insight.get("platform", "unknown"),
                    insight.get("fetch_method", "scraper"),
                    insight.get("original_id"),
                    json.dumps(insight.get("confidence_scores", {})),
                    insight.get("is_spam", False),
                    insight.get("is_duplicate", False),
                )
                return True
            except Exception as e:
                print(f"DB store_insight error: {e}")
        
        # In-memory fallback
        if job_id not in self._insights:
            self._insights[job_id] = []
        self._insights[job_id].append(insight)
        return True
    
    async def get_insights(
        self,
        job_id: str,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[List[Dict], int]:
        """Get insights for a job."""
        if self.is_connected:
            try:
                rows = await self._pool.fetch("""
                    SELECT * FROM insights 
                    WHERE job_id = $1 
                    ORDER BY created_at DESC
                    LIMIT $2 OFFSET $3
                """, UUID(job_id), limit, offset)
                
                count = await self._pool.fetchval(
                    "SELECT COUNT(*) FROM insights WHERE job_id = $1",
                    UUID(job_id)
                )
                
                return [dict(row) for row in rows], count
            except Exception as e:
                print(f"DB get_insights error: {e}")
        
        # In-memory fallback
        insights = self._insights.get(job_id, [])
        return insights[offset:offset+limit], len(insights)


# Singleton instance with module-level storage for persistence
_db_service: Optional[DatabaseService] = None
_shared_jobs: Dict[str, Dict] = {}
_shared_insights: Dict[str, List[Dict]] = {}


async def get_db_service() -> DatabaseService:
    """Get or create database service singleton."""
    global _db_service, _shared_jobs, _shared_insights
    
    if _db_service is None:
        _db_service = DatabaseService()
        # Use shared module-level storage for in-memory fallback
        _db_service._jobs = _shared_jobs
        _db_service._insights = _shared_insights
        await _db_service.connect()
    
    return _db_service


def get_db_service_sync() -> DatabaseService:
    """Get database service synchronously (for Celery tasks)."""
    global _db_service, _shared_jobs, _shared_insights
    
    if _db_service is None:
        _db_service = DatabaseService()
        _db_service._jobs = _shared_jobs
        _db_service._insights = _shared_insights
    
    return _db_service
