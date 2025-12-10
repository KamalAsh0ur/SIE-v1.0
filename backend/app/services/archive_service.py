"""
Archive Storage Service

Handles archival to cold storage (Cloudflare R2 / Backblaze B2).
Implements SRS §4.2 requirements.
"""

from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
import json
import gzip
from io import BytesIO


class ArchiveService:
    """
    Archive service for cold storage operations.
    
    Supports:
    - Cloudflare R2 (S3-compatible)
    - Backblaze B2 (S3-compatible)
    - Local file system (for development)
    """
    
    def __init__(
        self,
        provider: str = "local",
        bucket_name: str = "sie-archive",
        endpoint_url: str = None,
        access_key: str = None,
        secret_key: str = None,
        region: str = "auto",
    ):
        """
        Initialize archive service.
        
        Args:
            provider: 'r2', 'b2', 's3', or 'local'
            bucket_name: S3 bucket name
            endpoint_url: S3-compatible endpoint URL
            access_key: AWS access key
            secret_key: AWS secret key
            region: AWS region
        """
        self.provider = provider
        self.bucket_name = bucket_name
        self.endpoint_url = endpoint_url
        self.access_key = access_key
        self.secret_key = secret_key
        self.region = region
        self._client = None
    
    @property
    def client(self):
        """Lazy-load S3 client."""
        if self._client is None and self.provider != "local":
            try:
                import boto3
                self._client = boto3.client(
                    's3',
                    endpoint_url=self.endpoint_url,
                    aws_access_key_id=self.access_key,
                    aws_secret_access_key=self.secret_key,
                    region_name=self.region,
                )
                print(f"✓ Connected to {self.provider} storage")
            except Exception as e:
                print(f"⚠ Could not connect to storage: {e}")
                self._client = False
        return self._client if self._client else None
    
    async def archive_insights(
        self,
        insights: List[Dict[str, Any]],
        job_id: str,
        tenant: str,
        compress: bool = True,
    ) -> Dict[str, Any]:
        """
        Archive insights to cold storage.
        
        Args:
            insights: List of insight dictionaries
            job_id: Job ID for organization
            tenant: Tenant ID
            compress: Use gzip compression
            
        Returns:
            Archive metadata
        """
        if not insights:
            return {"archived": False, "reason": "No insights to archive"}
        
        # Generate archive key
        date_prefix = datetime.utcnow().strftime("%Y/%m/%d")
        archive_key = f"{tenant}/{date_prefix}/{job_id}.json"
        if compress:
            archive_key += ".gz"
        
        # Serialize insights
        data = json.dumps(insights, default=str).encode('utf-8')
        
        if compress:
            buffer = BytesIO()
            with gzip.GzipFile(fileobj=buffer, mode='wb') as gz:
                gz.write(data)
            data = buffer.getvalue()
        
        # Upload
        if self.provider == "local":
            result = await self._archive_local(archive_key, data)
        else:
            result = await self._archive_s3(archive_key, data, compress)
        
        return {
            "archived": True,
            "key": archive_key,
            "size_bytes": len(data),
            "compressed": compress,
            "timestamp": datetime.utcnow().isoformat(),
            **result,
        }
    
    async def _archive_s3(
        self,
        key: str,
        data: bytes,
        compressed: bool,
    ) -> Dict[str, Any]:
        """Upload to S3-compatible storage."""
        if not self.client:
            raise RuntimeError("S3 client not available")
        
        content_type = "application/gzip" if compressed else "application/json"
        
        self.client.put_object(
            Bucket=self.bucket_name,
            Key=key,
            Body=data,
            ContentType=content_type,
            Metadata={
                "archived-at": datetime.utcnow().isoformat(),
                "compressed": str(compressed),
            },
        )
        
        return {"provider": self.provider, "bucket": self.bucket_name}
    
    async def _archive_local(self, key: str, data: bytes) -> Dict[str, Any]:
        """Archive to local file system (development only)."""
        import os
        
        archive_dir = os.path.join(os.getcwd(), "archive", os.path.dirname(key))
        os.makedirs(archive_dir, exist_ok=True)
        
        filepath = os.path.join(os.getcwd(), "archive", key)
        with open(filepath, 'wb') as f:
            f.write(data)
        
        return {"provider": "local", "path": filepath}
    
    async def retrieve_archive(
        self,
        key: str,
        decompress: bool = True,
    ) -> List[Dict[str, Any]]:
        """
        Retrieve archived insights.
        
        Args:
            key: Archive key
            decompress: Decompress gzipped data
            
        Returns:
            List of insight dictionaries
        """
        if self.provider == "local":
            data = await self._retrieve_local(key)
        else:
            data = await self._retrieve_s3(key)
        
        # Decompress if needed
        if decompress and key.endswith('.gz'):
            buffer = BytesIO(data)
            with gzip.GzipFile(fileobj=buffer, mode='rb') as gz:
                data = gz.read()
        
        return json.loads(data.decode('utf-8'))
    
    async def _retrieve_s3(self, key: str) -> bytes:
        """Retrieve from S3-compatible storage."""
        if not self.client:
            raise RuntimeError("S3 client not available")
        
        response = self.client.get_object(Bucket=self.bucket_name, Key=key)
        return response['Body'].read()
    
    async def _retrieve_local(self, key: str) -> bytes:
        """Retrieve from local file system."""
        import os
        
        filepath = os.path.join(os.getcwd(), "archive", key)
        with open(filepath, 'rb') as f:
            return f.read()
    
    async def list_archives(
        self,
        tenant: str,
        prefix: str = "",
        max_results: int = 100,
    ) -> List[Dict[str, Any]]:
        """
        List archived files for a tenant.
        
        Args:
            tenant: Tenant ID
            prefix: Additional prefix filter
            max_results: Maximum results to return
            
        Returns:
            List of archive metadata
        """
        full_prefix = f"{tenant}/{prefix}"
        
        if self.provider == "local":
            return await self._list_local(full_prefix, max_results)
        else:
            return await self._list_s3(full_prefix, max_results)
    
    async def _list_s3(self, prefix: str, max_results: int) -> List[Dict[str, Any]]:
        """List objects in S3."""
        if not self.client:
            return []
        
        response = self.client.list_objects_v2(
            Bucket=self.bucket_name,
            Prefix=prefix,
            MaxKeys=max_results,
        )
        
        archives = []
        for obj in response.get('Contents', []):
            archives.append({
                "key": obj['Key'],
                "size_bytes": obj['Size'],
                "last_modified": obj['LastModified'].isoformat(),
            })
        
        return archives
    
    async def _list_local(self, prefix: str, max_results: int) -> List[Dict[str, Any]]:
        """List local archive files."""
        import os
        
        archive_dir = os.path.join(os.getcwd(), "archive", prefix)
        if not os.path.exists(archive_dir):
            return []
        
        archives = []
        for root, _, files in os.walk(archive_dir):
            for file in files[:max_results]:
                filepath = os.path.join(root, file)
                stat = os.stat(filepath)
                rel_path = os.path.relpath(filepath, os.path.join(os.getcwd(), "archive"))
                archives.append({
                    "key": rel_path,
                    "size_bytes": stat.st_size,
                    "last_modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                })
        
        return archives[:max_results]
    
    async def delete_archive(self, key: str) -> bool:
        """Delete an archived file."""
        try:
            if self.provider == "local":
                import os
                filepath = os.path.join(os.getcwd(), "archive", key)
                os.remove(filepath)
            else:
                if self.client:
                    self.client.delete_object(Bucket=self.bucket_name, Key=key)
            return True
        except Exception as e:
            print(f"⚠ Failed to delete archive {key}: {e}")
            return False


class RetentionPolicy:
    """
    Data retention policy manager.
    
    Handles moving data from hot to cold storage based on age.
    """
    
    def __init__(
        self,
        hot_retention_days: int = 90,
        cold_retention_days: int = 730,  # 2 years
        archive_service: ArchiveService = None,
    ):
        """
        Initialize retention policy.
        
        Args:
            hot_retention_days: Days to keep in hot storage
            cold_retention_days: Days to keep in cold storage
            archive_service: Archive service for cold storage
        """
        self.hot_retention_days = hot_retention_days
        self.cold_retention_days = cold_retention_days
        self.archive_service = archive_service or ArchiveService()
    
    def get_archive_cutoff(self) -> datetime:
        """Get date cutoff for archival."""
        return datetime.utcnow() - timedelta(days=self.hot_retention_days)
    
    def get_delete_cutoff(self) -> datetime:
        """Get date cutoff for permanent deletion."""
        return datetime.utcnow() - timedelta(days=self.cold_retention_days)
    
    async def archive_old_insights(
        self,
        db_session,
        batch_size: int = 1000,
    ) -> Dict[str, Any]:
        """
        Archive insights older than retention period.
        
        Args:
            db_session: Database session
            batch_size: Number of records per batch
            
        Returns:
            Archival statistics
        """
        from sqlalchemy import select, delete
        from app.models.database import Insight
        
        cutoff = self.get_archive_cutoff()
        stats = {"archived": 0, "batches": 0, "errors": 0}
        
        while True:
            # Query old insights
            query = (
                select(Insight)
                .where(Insight.created_at < cutoff)
                .where(Insight.archived_at.is_(None))
                .limit(batch_size)
            )
            
            result = await db_session.execute(query)
            insights = result.scalars().all()
            
            if not insights:
                break
            
            # Group by job_id
            by_job = {}
            for insight in insights:
                job_id = str(insight.job_id)
                if job_id not in by_job:
                    by_job[job_id] = []
                by_job[job_id].append(insight.to_dict())
            
            # Archive each job's insights
            for job_id, job_insights in by_job.items():
                try:
                    tenant = job_insights[0].get('tenant', 'default')
                    await self.archive_service.archive_insights(
                        job_insights, job_id, tenant
                    )
                    
                    # Mark as archived
                    for insight in insights:
                        if str(insight.job_id) == job_id:
                            insight.archived_at = datetime.utcnow()
                    
                    stats["archived"] += len(job_insights)
                except Exception as e:
                    print(f"⚠ Failed to archive job {job_id}: {e}")
                    stats["errors"] += 1
            
            await db_session.commit()
            stats["batches"] += 1
        
        return stats


# Singleton instances
_archive_service = None
_retention_policy = None


def get_archive_service() -> ArchiveService:
    """Get singleton archive service."""
    global _archive_service
    if _archive_service is None:
        from app.config import settings
        _archive_service = ArchiveService(
            provider=getattr(settings, 'archive_provider', 'local'),
            bucket_name=getattr(settings, 'archive_bucket', 'sie-archive'),
            endpoint_url=getattr(settings, 'archive_endpoint_url', None),
            access_key=getattr(settings, 'archive_access_key', None),
            secret_key=getattr(settings, 'archive_secret_key', None),
        )
    return _archive_service


def get_retention_policy() -> RetentionPolicy:
    """Get singleton retention policy."""
    global _retention_policy
    if _retention_policy is None:
        _retention_policy = RetentionPolicy(
            archive_service=get_archive_service()
        )
    return _retention_policy
