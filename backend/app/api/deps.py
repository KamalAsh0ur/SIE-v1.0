"""
API Dependencies

Shared dependencies for authentication, database access, etc.
"""

from typing import Optional
from fastapi import Header, HTTPException, Depends

from app.config import settings


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
    
    In development mode, allows requests without API key for easier testing.
    """
    # Extract API key from headers
    api_key = None
    
    if x_api_key:
        api_key = x_api_key
    elif authorization and authorization.startswith("Bearer "):
        api_key = authorization[7:]
    
    # In development, allow unauthenticated requests
    if settings.debug and not api_key:
        return "development"
    
    # Validate API key
    if not api_key:
        raise HTTPException(
            status_code=401,
            detail="API key required. Provide X-API-Key header or Authorization: Bearer <token>",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # TODO: Validate against database of API keys
    # For now, accept any non-empty key in development
    if settings.debug:
        return api_key
    
    # Production validation would check against api_clients table
    # if not await validate_client_key(api_key):
    #     raise HTTPException(status_code=401, detail="Invalid API key")
    
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
    
    TODO: Implement with Redis-based rate limiting.
    """
    # rate_key = f"rate_limit:{api_key}"
    # current = await redis.incr(rate_key)
    # if current == 1:
    #     await redis.expire(rate_key, 60)
    # if current > settings.rate_limit_per_minute:
    #     raise HTTPException(status_code=429, detail="Rate limit exceeded")
    pass
