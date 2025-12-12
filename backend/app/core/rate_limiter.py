"""
Rate Limiter

Redis-based sliding window rate limiting for per-tenant job control.
Prevents single tenants from overwhelming the system.
"""

import time
from typing import Optional
from functools import lru_cache


class TenantRateLimiter:
    """
    Per-tenant rate limiting using Redis sliding window algorithm.
    
    Implements a sliding window counter pattern for accurate rate limiting
    with minimal Redis operations.
    """
    
    def __init__(self, redis_client, default_limit: int = 100, window_seconds: int = 60):
        """
        Initialize rate limiter.
        
        Args:
            redis_client: Redis async client
            default_limit: Default requests per window (100/min)
            window_seconds: Window size in seconds (60 = 1 minute)
        """
        self.redis = redis_client
        self.default_limit = default_limit
        self.window_seconds = window_seconds
    
    async def check_rate_limit(
        self, 
        tenant: str, 
        limit: Optional[int] = None,
        cost: int = 1
    ) -> tuple[bool, dict]:
        """
        Check if tenant is within rate limit.
        
        Args:
            tenant: Tenant identifier
            limit: Custom limit for this tenant (optional)
            cost: Cost of this request (default 1, use higher for expensive ops)
            
        Returns:
            Tuple of (is_allowed, rate_info)
        """
        limit = limit or self.default_limit
        key = f"ratelimit:{tenant}"
        now = time.time()
        window_start = now - self.window_seconds
        
        # Use Redis pipeline for atomic operations
        pipe = self.redis.pipeline()
        
        # Remove old entries outside the window
        pipe.zremrangebyscore(key, 0, window_start)
        
        # Count current requests in window
        pipe.zcard(key)
        
        # Add current request
        pipe.zadd(key, {f"{now}:{cost}": now})
        
        # Set expiry to prevent stale keys
        pipe.expire(key, self.window_seconds * 2)
        
        _, current_count, _, _ = await pipe.execute()
        
        remaining = max(0, limit - current_count - cost)
        reset_at = int(now + self.window_seconds)
        
        rate_info = {
            "limit": limit,
            "remaining": remaining,
            "reset_at": reset_at,
            "current": current_count,
            "window_seconds": self.window_seconds,
        }
        
        is_allowed = current_count + cost <= limit
        
        if not is_allowed:
            # Remove the request we just added if over limit
            await self.redis.zrem(key, f"{now}:{cost}")
        
        return is_allowed, rate_info
    
    async def get_usage(self, tenant: str) -> dict:
        """Get current rate limit usage for a tenant."""
        key = f"ratelimit:{tenant}"
        now = time.time()
        window_start = now - self.window_seconds
        
        # Clean and count
        await self.redis.zremrangebyscore(key, 0, window_start)
        current_count = await self.redis.zcard(key)
        
        return {
            "tenant": tenant,
            "current": current_count,
            "limit": self.default_limit,
            "remaining": max(0, self.default_limit - current_count),
            "reset_in_seconds": self.window_seconds,
        }
    
    async def reset_limit(self, tenant: str) -> bool:
        """Reset rate limit for a tenant (admin use)."""
        key = f"ratelimit:{tenant}"
        await self.redis.delete(key)
        return True


class TierBasedRateLimiter(TenantRateLimiter):
    """
    Rate limiter with tenant tiers (free, pro, enterprise).
    """
    
    TIER_LIMITS = {
        "free": 50,       # 50 jobs/minute
        "pro": 200,       # 200 jobs/minute
        "enterprise": 1000,  # 1000 jobs/minute
    }
    
    def __init__(self, redis_client, tier_lookup_func=None):
        """
        Args:
            redis_client: Redis client
            tier_lookup_func: Async function to lookup tenant tier
        """
        super().__init__(redis_client)
        self.tier_lookup = tier_lookup_func or self._default_tier_lookup
    
    async def _default_tier_lookup(self, tenant: str) -> str:
        """Default tier lookup - returns 'free' for all tenants."""
        return "free"
    
    async def check_rate_limit(
        self, 
        tenant: str,
        cost: int = 1
    ) -> tuple[bool, dict]:
        """Check rate limit based on tenant tier."""
        tier = await self.tier_lookup(tenant)
        limit = self.TIER_LIMITS.get(tier, self.TIER_LIMITS["free"])
        
        is_allowed, rate_info = await super().check_rate_limit(
            tenant, 
            limit=limit,
            cost=cost
        )
        
        rate_info["tier"] = tier
        return is_allowed, rate_info


# Singleton instance
_rate_limiter: Optional[TenantRateLimiter] = None


async def get_rate_limiter() -> TenantRateLimiter:
    """Get singleton rate limiter instance."""
    global _rate_limiter
    
    if _rate_limiter is None:
        try:
            import redis.asyncio as redis
            from app.config import settings
            
            client = redis.from_url(settings.redis_url)
            _rate_limiter = TenantRateLimiter(client)
        except Exception:
            # Return a no-op limiter if Redis unavailable
            _rate_limiter = NoOpRateLimiter()
    
    return _rate_limiter


class NoOpRateLimiter:
    """No-op rate limiter for when Redis is unavailable."""
    
    async def check_rate_limit(self, *args, **kwargs) -> tuple[bool, dict]:
        return True, {"limit": -1, "remaining": -1, "disabled": True}
    
    async def get_usage(self, tenant: str) -> dict:
        return {"tenant": tenant, "disabled": True}
    
    async def reset_limit(self, tenant: str) -> bool:
        return True
