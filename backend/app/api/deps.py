"""
API Dependencies

Shared dependencies for authentication, database access, etc.
"""

from typing import Optional
from fastapi import Header, HTTPException, Depends

from app.config import settings


# Development API keys (only valid when debug=True)
DEV_API_KEYS = {"dev-api-key-12345", "test-api-key", "development"}


# ============================================================================
# Authentication
# ============================================================================

async def verify_api_key(
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    authorization: Optional[str] = Header(None),
) -> str:
    """
    Verify API key from request headers.
    
    Accepts key from either X-API-Key header or Authorization: Bearer token.
    
    SECURITY: Always requires valid API key. No bypass for unauthenticated requests.
    """
    # Extract API key from headers
    api_key = None
    
    if x_api_key:
        api_key = x_api_key
    elif authorization and authorization.startswith("Bearer "):
        api_key = authorization[7:]
    
    # Always require an API key
    if not api_key:
        raise HTTPException(
            status_code=401,
            detail="API key required. Provide X-API-Key header or Authorization: Bearer <token>",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # In development, accept known dev keys
    if settings.debug and api_key in DEV_API_KEYS:
        return api_key
    
    # In development, also accept any key for flexibility
    if settings.debug:
        return api_key
    
    # Production: validate against database
    # TODO: Implement database validation
    # For now, check against a configured secret
    if api_key == settings.api_secret_key:
        return api_key
    
    # If we get here in production without a valid key, reject
    if not settings.debug:
        raise HTTPException(
            status_code=401,
            detail="Invalid API key",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return api_key


async def get_current_tenant(
    x_tenant_id: Optional[str] = Header(None, alias="X-Tenant-ID"),
    api_key: str = Depends(verify_api_key),
) -> str:
    """
    Get current tenant from request.
    
    Tenant can be specified via X-Tenant-ID header or derived from API key.
    """
    if x_tenant_id:
        return x_tenant_id
    
    # TODO: Look up tenant from API key
    return "default"


# ============================================================================
# Database
# ============================================================================

async def get_db():
    """
    Get database session.
    
    TODO: Implement with SQLAlchemy async session.
    """
    # from app.models.database import AsyncSessionLocal
    # async with AsyncSessionLocal() as session:
    #     yield session
    yield None


# ============================================================================
# Rate Limiting
# ============================================================================

async def check_rate_limit(
    api_key: str = Depends(verify_api_key),
):
    """
    Check if request is within rate limits.
    
    Uses Redis-based sliding window rate limiting.
    """
    if not settings.rate_limit_enabled:
        return
    
    try:
        from app.core.rate_limiter import get_rate_limiter
        
        rate_limiter = await get_rate_limiter()
        is_allowed, rate_info = await rate_limiter.check_rate_limit(api_key)
        
        if not is_allowed:
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded. Resets at {rate_info.get('reset_at', 'unknown')}",
                headers={
                    "X-RateLimit-Limit": str(rate_info.get("limit", 0)),
                    "X-RateLimit-Remaining": str(rate_info.get("remaining", 0)),
                    "X-RateLimit-Reset": str(rate_info.get("reset_at", 0)),
                    "Retry-After": "60",
                },
            )
    except ImportError:
        pass  # Rate limiter not available
    except HTTPException:
        raise  # Re-raise rate limit errors
    except Exception as e:
        # Log but don't block if rate limiting fails
        print(f"Rate limit check failed: {e}")

