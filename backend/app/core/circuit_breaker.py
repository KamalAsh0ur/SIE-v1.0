"""
Circuit Breaker for External Services

Prevents cascading failures when AI/external services are unavailable.
Implements SRE Plan §6.1 requirements.
"""

import asyncio
import time
from dataclasses import dataclass, field
from enum import Enum
from functools import wraps
from typing import Any, Callable, Optional
from collections import deque

from app.core.logging import get_logger

# Import metrics - graceful fallback if not available
try:
    from app.core.metrics import (
        record_circuit_breaker_state,
        record_circuit_breaker_failure,
        record_circuit_breaker_rejection,
    )
    METRICS_AVAILABLE = True
except ImportError:
    METRICS_AVAILABLE = False

logger = get_logger("circuit_breaker")


class CircuitState(Enum):
    """Circuit breaker states."""
    CLOSED = "closed"      # Normal operation, requests flow through
    OPEN = "open"          # Failures detected, requests blocked
    HALF_OPEN = "half_open"  # Testing if service recovered


@dataclass
class CircuitBreakerConfig:
    """Configuration for a circuit breaker."""
    failure_threshold: int = 5       # Failures before opening
    recovery_timeout: int = 60       # Seconds before trying again
    half_open_max_calls: int = 3     # Test calls in half-open state
    success_threshold: int = 2       # Successes to close from half-open
    
    # Metrics tracking
    window_size: int = 60            # Seconds for failure window


@dataclass 
class CircuitBreakerState:
    """Runtime state for a circuit breaker."""
    state: CircuitState = CircuitState.CLOSED
    failure_count: int = 0
    success_count: int = 0
    last_failure_time: Optional[float] = None
    last_state_change: float = field(default_factory=time.time)
    half_open_calls: int = 0
    failure_times: deque = field(default_factory=lambda: deque(maxlen=100))


class CircuitBreaker:
    """
    Circuit breaker implementation for async functions.
    
    States:
    - CLOSED: Normal operation, tracking failures
    - OPEN: Service is failing, reject calls immediately  
    - HALF_OPEN: Testing if service recovered
    
    Usage:
        cb = CircuitBreaker("ai_service", failure_threshold=5)
        
        @cb.protect
        async def call_ai_service():
            ...
    """
    
    # Registry of all circuit breakers for monitoring
    _registry: dict[str, "CircuitBreaker"] = {}
    
    def __init__(
        self,
        name: str,
        failure_threshold: int = 5,
        recovery_timeout: int = 60,
        fallback: Optional[Callable] = None,
    ):
        self.name = name
        self.config = CircuitBreakerConfig(
            failure_threshold=failure_threshold,
            recovery_timeout=recovery_timeout,
        )
        self.state = CircuitBreakerState()
        self.fallback = fallback
        self._lock = asyncio.Lock()
        
        # Register this circuit breaker
        CircuitBreaker._registry[name] = self
    
    @property
    def is_closed(self) -> bool:
        return self.state.state == CircuitState.CLOSED
    
    @property
    def is_open(self) -> bool:
        return self.state.state == CircuitState.OPEN
    
    @property
    def is_half_open(self) -> bool:
        return self.state.state == CircuitState.HALF_OPEN
    
    def _should_attempt_reset(self) -> bool:
        """Check if enough time has passed to try resetting."""
        if self.state.last_failure_time is None:
            return True
        elapsed = time.time() - self.state.last_failure_time
        return elapsed >= self.config.recovery_timeout
    
    def _count_recent_failures(self) -> int:
        """Count failures within the sliding window."""
        cutoff = time.time() - self.config.window_size
        while self.state.failure_times and self.state.failure_times[0] < cutoff:
            self.state.failure_times.popleft()
        return len(self.state.failure_times)
    
    async def _record_success(self):
        """Record a successful call."""
        async with self._lock:
            if self.state.state == CircuitState.HALF_OPEN:
                self.state.success_count += 1
                if self.state.success_count >= self.config.success_threshold:
                    self._transition_to(CircuitState.CLOSED)
            else:
                self.state.failure_count = 0
    
    async def _record_failure(self, error: Exception):
        """Record a failed call."""
        async with self._lock:
            now = time.time()
            self.state.failure_times.append(now)
            self.state.last_failure_time = now
            self.state.failure_count += 1
            
            if self.state.state == CircuitState.HALF_OPEN:
                # Any failure in half-open goes back to open
                self._transition_to(CircuitState.OPEN)
            elif self._count_recent_failures() >= self.config.failure_threshold:
                self._transition_to(CircuitState.OPEN)
            
            # Emit metrics
            if METRICS_AVAILABLE:
                record_circuit_breaker_failure(self.name)
            
            logger.warning(
                "circuit_breaker_failure",
                circuit=self.name,
                state=self.state.state.value,
                failure_count=self.state.failure_count,
                error=str(error)[:100],
            )
    
    def _transition_to(self, new_state: CircuitState):
        """Transition to a new state."""
        old_state = self.state.state
        self.state.state = new_state
        self.state.last_state_change = time.time()
        
        if new_state == CircuitState.CLOSED:
            self.state.failure_count = 0
            self.state.success_count = 0
        elif new_state == CircuitState.HALF_OPEN:
            self.state.half_open_calls = 0
            self.state.success_count = 0
        
        # Emit metrics for state change
        if METRICS_AVAILABLE:
            record_circuit_breaker_state(self.name, new_state.value)
        
        logger.info(
            "circuit_breaker_state_change",
            circuit=self.name,
            from_state=old_state.value,
            to_state=new_state.value,
        )
    
    async def _can_execute(self) -> bool:
        """Check if a call can be executed."""
        async with self._lock:
            if self.state.state == CircuitState.CLOSED:
                return True
            
            if self.state.state == CircuitState.OPEN:
                if self._should_attempt_reset():
                    self._transition_to(CircuitState.HALF_OPEN)
                    return True
                return False
            
            if self.state.state == CircuitState.HALF_OPEN:
                if self.state.half_open_calls < self.config.half_open_max_calls:
                    self.state.half_open_calls += 1
                    return True
                return False
            
            return False
    
    def protect(self, func: Callable) -> Callable:
        """Decorator to protect an async function with this circuit breaker."""
        @wraps(func)
        async def wrapper(*args, **kwargs) -> Any:
            if not await self._can_execute():
                # Emit rejection metric
                if METRICS_AVAILABLE:
                    record_circuit_breaker_rejection(self.name)
                
                logger.warning(
                    "circuit_breaker_rejected",
                    circuit=self.name,
                    state=self.state.state.value,
                )
                if self.fallback:
                    return await self.fallback(*args, **kwargs) if asyncio.iscoroutinefunction(self.fallback) else self.fallback(*args, **kwargs)
                raise CircuitBreakerOpen(f"Circuit breaker '{self.name}' is open")
            
            try:
                result = await func(*args, **kwargs)
                await self._record_success()
                return result
            except Exception as e:
                await self._record_failure(e)
                if self.fallback:
                    return await self.fallback(*args, **kwargs) if asyncio.iscoroutinefunction(self.fallback) else self.fallback(*args, **kwargs)
                raise
        
        return wrapper
    
    def get_status(self) -> dict:
        """Get current circuit breaker status for monitoring."""
        return {
            "name": self.name,
            "state": self.state.state.value,
            "failure_count": self.state.failure_count,
            "success_count": self.state.success_count,
            "last_failure": self.state.last_failure_time,
            "last_state_change": self.state.last_state_change,
            "config": {
                "failure_threshold": self.config.failure_threshold,
                "recovery_timeout": self.config.recovery_timeout,
            }
        }
    
    @classmethod
    def get_all_status(cls) -> dict[str, dict]:
        """Get status of all registered circuit breakers."""
        return {name: cb.get_status() for name, cb in cls._registry.items()}


class CircuitBreakerOpen(Exception):
    """Raised when circuit breaker is open and rejects a call."""
    pass


# ============================================================================
# Pre-configured Circuit Breakers
# ============================================================================

def nlp_fallback(text: str) -> dict:
    """Fallback NLP result when circuit is open."""
    return {
        "sentiment": {"type": "unknown", "score": 0.0, "confidence": 0.0},
        "entities": [],
        "topics": ["Uncategorized"],
        "keywords": [],
        "language": {"code": "unknown", "name": "Unknown", "confidence": 0.0},
        "_fallback": True,
        "_reason": "circuit_breaker_open",
    }


def ocr_fallback(image_urls: list) -> dict:
    """Fallback OCR result when circuit is open."""
    return {
        "extracted_text": "",
        "confidence": 0.0,
        "images_processed": 0,
        "_fallback": True,
        "_reason": "circuit_breaker_open",
    }


def scraper_fallback(*args, **kwargs) -> list:
    """Fallback scraper result when circuit is open."""
    return []


# Pre-configured circuit breakers for each service
nlp_circuit = CircuitBreaker(
    name="nlp_service",
    failure_threshold=5,
    recovery_timeout=60,
    fallback=nlp_fallback,
)

ocr_circuit = CircuitBreaker(
    name="ocr_service", 
    failure_threshold=5,
    recovery_timeout=60,
    fallback=ocr_fallback,
)

scraper_circuit = CircuitBreaker(
    name="scraper_service",
    failure_threshold=10,
    recovery_timeout=120,
    fallback=scraper_fallback,
)

ai_circuit = CircuitBreaker(
    name="ai_service",
    failure_threshold=5,
    recovery_timeout=60,
)
