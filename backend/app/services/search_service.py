"""
Meilisearch Service

Full-text search indexing and querying for insights.
Implements SRS §4.1 requirements.
"""

from typing import List, Optional, Dict, Any
import asyncio


class MeilisearchService:
    """
    Meilisearch client for insight indexing and search.
    
    Features:
    - Index creation and configuration
    - Document indexing
    - Full-text search
    - Faceted filtering
    """
    
    _client = None
    INDEX_NAME = "insights"
    
    def __init__(self, url: str = None, api_key: str = None):
        """
        Initialize Meilisearch service.
        
        Args:
            url: Meilisearch server URL
            api_key: Master key for authentication
        """
        from app.config import settings
        
        self.url = url or settings.meilisearch_url
        self.api_key = api_key or settings.meilisearch_key
    
    @property
    def client(self):
        """Lazy-load Meilisearch client."""
        if self._client is None:
            try:
                import meilisearch
                self._client = meilisearch.Client(self.url, self.api_key)
                print(f"✓ Connected to Meilisearch at {self.url}")
            except Exception as e:
                print(f"⚠ Could not connect to Meilisearch: {e}")
                return None
        return self._client
    
    async def setup_index(self):
        """
        Create and configure the insights index.
        
        Sets up searchable, filterable, and sortable attributes.
        """
        if not self.client:
            return False
        
        try:
            # Create index if not exists
            self.client.create_index(self.INDEX_NAME, {"primaryKey": "post_id"})
            
            index = self.client.index(self.INDEX_NAME)
            
            # Configure searchable attributes
            index.update_searchable_attributes([
                "content_text",
                "ocr_text",
                "topics",
                "keywords",
                "entities_text",  # Flattened entity names
                "author_name",
            ])
            
            # Configure filterable attributes
            index.update_filterable_attributes([
                "tenant",
                "job_id",
                "sentiment_type",
                "platform",
                "language",
                "is_spam",
                "is_duplicate",
                "created_at",
                "published_at",
            ])
            
            # Configure sortable attributes
            index.update_sortable_attributes([
                "created_at",
                "published_at",
                "sentiment_score",
                "quality_score",
            ])
            
            # Configure ranking rules
            index.update_ranking_rules([
                "words",
                "typo",
                "proximity",
                "attribute",
                "sort",
                "exactness",
            ])
            
            # Configure stop words
            index.update_stop_words([
                "the", "a", "an", "and", "or", "but", "in", "on", "at",
                "to", "for", "of", "with", "by", "from", "as", "is", "was",
            ])
            
            print(f"✓ Meilisearch index '{self.INDEX_NAME}' configured")
            return True
            
        except Exception as e:
            print(f"⚠ Failed to setup Meilisearch index: {e}")
            return False
    
    async def index_insight(self, insight: Dict[str, Any]) -> bool:
        """
        Index a single insight document.
        
        Args:
            insight: Normalized post data
        """
        return await self.index_insights([insight])
    
    async def index_insights(self, insights: List[Dict[str, Any]]) -> bool:
        """
        Index multiple insight documents.
        
        Args:
            insights: List of normalized post data
        """
        if not self.client or not insights:
            return False
        
        try:
            # Prepare documents for indexing
            documents = []
            for insight in insights:
                doc = self._prepare_document(insight)
                documents.append(doc)
            
            # Index documents
            index = self.client.index(self.INDEX_NAME)
            task = index.add_documents(documents)
            
            # Wait for indexing to complete
            self.client.wait_for_task(task.task_uid, timeout_in_ms=30000)
            
            return True
            
        except Exception as e:
            print(f"⚠ Failed to index insights: {e}")
            return False
    
    def _prepare_document(self, insight: Dict[str, Any]) -> Dict[str, Any]:
        """
        Prepare insight for Meilisearch indexing.
        
        Flattens nested structures and extracts searchable text.
        """
        # Flatten entities to searchable text
        entities = insight.get("entities", [])
        entities_text = " ".join([e.get("name", "") for e in entities if isinstance(e, dict)])
        
        # Flatten topics
        topics = insight.get("topics", [])
        if isinstance(topics, list):
            topics_text = " ".join(topics)
        else:
            topics_text = str(topics)
        
        return {
            "post_id": insight.get("post_id"),
            "job_id": insight.get("job_id"),
            "tenant": insight.get("tenant"),
            "content_text": insight.get("content_text", ""),
            "ocr_text": insight.get("ocr_text", ""),
            "topics": topics,
            "topics_text": topics_text,
            "keywords": insight.get("keywords", []),
            "entities_text": entities_text,
            "author_name": insight.get("author", {}).get("name") if isinstance(insight.get("author"), dict) else insight.get("author"),
            "sentiment_type": insight.get("sentiment", {}).get("type") if isinstance(insight.get("sentiment"), dict) else insight.get("sentiment"),
            "sentiment_score": insight.get("sentiment", {}).get("score") if isinstance(insight.get("sentiment"), dict) else insight.get("sentiment_score"),
            "platform": insight.get("provenance", {}).get("platform") if isinstance(insight.get("provenance"), dict) else insight.get("platform"),
            "language": insight.get("language"),
            "is_spam": insight.get("is_spam", False),
            "is_duplicate": insight.get("is_duplicate", False),
            "quality_score": insight.get("quality_score"),
            "created_at": insight.get("created_at"),
            "published_at": insight.get("published_at"),
        }
    
    async def search(
        self,
        query: str,
        tenant: str = None,
        filters: Dict[str, Any] = None,
        sort: List[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """
        Search insights with full-text query and filters.
        
        Args:
            query: Search query string
            tenant: Filter by tenant (required in production)
            filters: Additional filter conditions
            sort: Sort order (e.g., ["created_at:desc"])
            limit: Maximum results to return
            offset: Results offset for pagination
            
        Returns:
            Search results with hits and metadata
        """
        if not self.client:
            return {"hits": [], "total": 0, "error": "Meilisearch not available"}
        
        try:
            index = self.client.index(self.INDEX_NAME)
            
            # Build filter string
            filter_parts = []
            if tenant:
                filter_parts.append(f"tenant = '{tenant}'")
            if filters:
                for key, value in filters.items():
                    if isinstance(value, bool):
                        filter_parts.append(f"{key} = {str(value).lower()}")
                    elif isinstance(value, list):
                        filter_parts.append(f"{key} IN {value}")
                    else:
                        filter_parts.append(f"{key} = '{value}'")
            
            filter_string = " AND ".join(filter_parts) if filter_parts else None
            
            # Execute search
            result = index.search(
                query,
                {
                    "limit": limit,
                    "offset": offset,
                    "filter": filter_string,
                    "sort": sort,
                    "attributesToRetrieve": [
                        "post_id", "job_id", "tenant", "content_text",
                        "sentiment_type", "sentiment_score", "topics",
                        "keywords", "platform", "language", "created_at",
                    ],
                    "attributesToHighlight": ["content_text"],
                    "highlightPreTag": "<mark>",
                    "highlightPostTag": "</mark>",
                }
            )
            
            return {
                "hits": result["hits"],
                "total": result.get("estimatedTotalHits", len(result["hits"])),
                "processing_time_ms": result.get("processingTimeMs", 0),
                "query": query,
            }
            
        except Exception as e:
            print(f"⚠ Search failed: {e}")
            return {"hits": [], "total": 0, "error": str(e)}
    
    async def delete_by_job(self, job_id: str) -> bool:
        """Delete all documents for a job."""
        if not self.client:
            return False
        
        try:
            index = self.client.index(self.INDEX_NAME)
            task = index.delete_documents_by_filter(f"job_id = '{job_id}'")
            self.client.wait_for_task(task.task_uid, timeout_in_ms=30000)
            return True
        except Exception as e:
            print(f"⚠ Failed to delete documents: {e}")
            return False
    
    async def get_stats(self) -> Dict[str, Any]:
        """Get index statistics."""
        if not self.client:
            return {}
        
        try:
            index = self.client.index(self.INDEX_NAME)
            stats = index.get_stats()
            return {
                "documents": stats.number_of_documents,
                "indexing": stats.is_indexing,
            }
        except Exception as e:
            return {"error": str(e)}


# Singleton instance
_meilisearch_service = None


def get_meilisearch_service() -> MeilisearchService:
    """Get singleton Meilisearch service."""
    global _meilisearch_service
    if _meilisearch_service is None:
        _meilisearch_service = MeilisearchService()
    return _meilisearch_service
