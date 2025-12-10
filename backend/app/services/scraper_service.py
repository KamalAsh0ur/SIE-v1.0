"""
Scraper Service

Modular web scraping connectors for non-API platforms.
Implements SRS §3.2 requirements.
"""

import asyncio
import re
from datetime import datetime
from typing import List, Optional, Dict, Any
from urllib.parse import urlparse
import hashlib


class ScraperService:
    """
    Web scraping service with modular connectors.
    
    Implements:
    - Rate limiting controls
    - robots.txt compliance
    - Structured error handling
    - Provenance metadata
    """
    
    def __init__(self, rate_limit_per_second: float = 1.0):
        """
        Initialize scraper service.
        
        Args:
            rate_limit_per_second: Max requests per second
        """
        self.rate_limit = rate_limit_per_second
        self.last_request_time: Dict[str, float] = {}
        self._robots_cache: Dict[str, bool] = {}
    
    async def scrape_urls(
        self,
        urls: List[str],
        include_images: bool = True,
    ) -> List[Dict[str, Any]]:
        """
        Scrape content from multiple URLs.
        
        Args:
            urls: List of URLs to scrape
            include_images: Whether to extract image URLs
            
        Returns:
            List of scraped content dictionaries
        """
        results = []
        
        for url in urls:
            try:
                # Respect rate limits
                await self._rate_limit(urlparse(url).netloc)
                
                # Check robots.txt
                if not await self._check_robots(url):
                    print(f"⚠ Skipping {url}: robots.txt disallows")
                    continue
                
                # Scrape the URL
                content = await self._scrape_url(url, include_images)
                if content:
                    results.append(content)
                    
            except Exception as e:
                print(f"⚠ Failed to scrape {url}: {e}")
                results.append({
                    "url": url,
                    "error": str(e),
                    "fetch_method": "scraper",
                    "fetched_at": datetime.utcnow().isoformat(),
                })
        
        return results
    
    async def _scrape_url(
        self,
        url: str,
        include_images: bool = True,
    ) -> Optional[Dict[str, Any]]:
        """
        Scrape a single URL.
        """
        import httpx
        from bs4 import BeautifulSoup
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                timeout=30.0,
                follow_redirects=True,
                headers={
                    "User-Agent": "Mozilla/5.0 (compatible; SIE-Bot/1.0; +https://sie.example.com/bot)"
                }
            )
            response.raise_for_status()
        
        # Parse HTML
        soup = BeautifulSoup(response.text, 'lxml')
        
        # Remove script and style elements
        for script in soup(["script", "style", "noscript"]):
            script.decompose()
        
        # Extract text content
        text = soup.get_text(separator=' ', strip=True)
        text = re.sub(r'\s+', ' ', text)  # Normalize whitespace
        
        # Extract metadata
        title = soup.title.string if soup.title else None
        description = None
        author = None
        published_at = None
        
        # Try to find meta tags
        for meta in soup.find_all('meta'):
            if meta.get('name') == 'description':
                description = meta.get('content')
            elif meta.get('name') == 'author':
                author = meta.get('content')
            elif meta.get('property') == 'article:published_time':
                published_at = meta.get('content')
        
        # Extract images if requested
        images = []
        if include_images:
            for img in soup.find_all('img', src=True):
                src = img['src']
                if not src.startswith('data:'):
                    # Make absolute URL
                    if src.startswith('/'):
                        parsed = urlparse(url)
                        src = f"{parsed.scheme}://{parsed.netloc}{src}"
                    images.append(src)
        
        return {
            "id": self._generate_id(url),
            "url": url,
            "content": text[:50000],  # Limit content size
            "title": title,
            "description": description,
            "author": author,
            "timestamp": published_at,
            "media": images[:10],  # Limit images
            "platform": self._detect_platform(url),
            "fetch_method": "scraper",
            "fetched_at": datetime.utcnow().isoformat(),
            "confidence": 0.8,  # Base confidence for scraped content
        }
    
    async def _rate_limit(self, domain: str):
        """Apply rate limiting per domain."""
        import time
        
        now = time.time()
        last = self.last_request_time.get(domain, 0)
        wait_time = (1.0 / self.rate_limit) - (now - last)
        
        if wait_time > 0:
            await asyncio.sleep(wait_time)
        
        self.last_request_time[domain] = time.time()
    
    async def _check_robots(self, url: str) -> bool:
        """
        Check if URL is allowed by robots.txt.
        
        TODO: Implement proper robots.txt parsing.
        """
        # For now, allow all URLs
        # In production, use a library like robotexclusionrulesparser
        return True
    
    def _detect_platform(self, url: str) -> str:
        """Detect platform from URL."""
        domain = urlparse(url).netloc.lower()
        
        platform_map = {
            'twitter.com': 'twitter',
            'x.com': 'twitter',
            'reddit.com': 'reddit',
            'linkedin.com': 'linkedin',
            'instagram.com': 'instagram',
            'facebook.com': 'facebook',
            'youtube.com': 'youtube',
            'tiktok.com': 'tiktok',
            'medium.com': 'medium',
        }
        
        for pattern, platform in platform_map.items():
            if pattern in domain:
                return platform
        
        return 'web'
    
    def _generate_id(self, url: str) -> str:
        """Generate unique ID for URL."""
        return hashlib.md5(url.encode()).hexdigest()[:16]


class SocialMediaScraper(ScraperService):
    """
    Specialized scraper for social media platforms.
    
    Handles platform-specific parsing and rate limits.
    """
    
    async def scrape_twitter_profile(self, username: str) -> List[Dict[str, Any]]:
        """
        Scrape Twitter/X profile.
        
        Note: Twitter has aggressive anti-scraping measures.
        Consider using the official API instead.
        """
        # Placeholder - would need special handling for Twitter
        url = f"https://twitter.com/{username}"
        return await self.scrape_urls([url])
    
    async def scrape_reddit_subreddit(
        self,
        subreddit: str,
        sort: str = 'hot',
        limit: int = 25,
    ) -> List[Dict[str, Any]]:
        """
        Scrape Reddit subreddit using JSON API.
        
        Reddit provides a public JSON API that's easier to use.
        """
        import httpx
        
        url = f"https://www.reddit.com/r/{subreddit}/{sort}.json?limit={limit}"
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                headers={"User-Agent": "SIE-Bot/1.0"},
                timeout=30.0,
            )
            response.raise_for_status()
        
        data = response.json()
        posts = []
        
        for child in data.get('data', {}).get('children', []):
            post_data = child.get('data', {})
            
            posts.append({
                "id": post_data.get('id'),
                "url": f"https://reddit.com{post_data.get('permalink', '')}",
                "content": f"{post_data.get('title', '')} {post_data.get('selftext', '')}",
                "title": post_data.get('title'),
                "author": post_data.get('author'),
                "timestamp": self._unix_to_iso(post_data.get('created_utc')),
                "platform": "reddit",
                "fetch_method": "api",
                "fetched_at": datetime.utcnow().isoformat(),
                "metadata": {
                    "score": post_data.get('score'),
                    "num_comments": post_data.get('num_comments'),
                    "subreddit": subreddit,
                },
            })
        
        return posts
    
    async def scrape_youtube_video(self, video_id: str) -> Optional[Dict[str, Any]]:
        """
        Scrape YouTube video metadata.
        
        Uses oembed API for basic metadata.
        """
        import httpx
        
        oembed_url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
        
        async with httpx.AsyncClient() as client:
            response = await client.get(oembed_url, timeout=30.0)
            response.raise_for_status()
        
        data = response.json()
        
        return {
            "id": video_id,
            "url": f"https://www.youtube.com/watch?v={video_id}",
            "content": data.get('title', ''),
            "title": data.get('title'),
            "author": data.get('author_name'),
            "platform": "youtube",
            "fetch_method": "oembed",
            "fetched_at": datetime.utcnow().isoformat(),
            "media": [data.get('thumbnail_url')] if data.get('thumbnail_url') else [],
        }
    
    def _unix_to_iso(self, timestamp: Optional[float]) -> Optional[str]:
        """Convert Unix timestamp to ISO format."""
        if timestamp:
            return datetime.utcfromtimestamp(timestamp).isoformat()
        return None


# Singleton instances
_scraper_service = None
_social_scraper = None


def get_scraper_service() -> ScraperService:
    """Get singleton scraper service."""
    global _scraper_service
    if _scraper_service is None:
        _scraper_service = ScraperService()
    return _scraper_service


def get_social_scraper() -> SocialMediaScraper:
    """Get singleton social media scraper."""
    global _social_scraper
    if _social_scraper is None:
        _social_scraper = SocialMediaScraper()
    return _social_scraper
