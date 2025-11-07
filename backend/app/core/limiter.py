from __future__ import annotations

from fastapi import FastAPI
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

__all__ = ["limiter", "configure_rate_limiting", "RateLimitExceeded"]

limiter = Limiter(key_func=get_remote_address, default_limits=["100/minute"])


def configure_rate_limiting(app: FastAPI) -> None:
    """Attach SlowAPI rate limiting middleware and handlers to the app."""
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, limiter._rate_limit_exceeded_handler)  # type: ignore[attr-defined]
    app.add_middleware(SlowAPIMiddleware)
