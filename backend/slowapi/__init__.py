from __future__ import annotations

from .errors import RateLimitExceeded
from .limiter import Limiter
from .middleware import SlowAPIMiddleware


async def _rate_limit_exceeded_handler(request, exc):
    limiter = getattr(getattr(request, "app", None), "state", None)
    if limiter is not None:
        limiter = getattr(limiter, "limiter", None)
    if limiter is None or not hasattr(limiter, "_rate_limit_exceeded_handler"):
        raise exc
    return await limiter._rate_limit_exceeded_handler(request, exc)


__all__ = [
    "Limiter",
    "RateLimitExceeded",
    "SlowAPIMiddleware",
    "_rate_limit_exceeded_handler",
]
