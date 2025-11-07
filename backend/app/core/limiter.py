from __future__ import annotations

from fastapi import FastAPI
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address


async def _compat_check_request(request):
    endpoint = request.scope.get("endpoint")
    check_limit = getattr(limiter, "_check_request_limit", None)
    if check_limit is None:
        raise AttributeError("Limiter missing check_request implementation")
    return check_limit(request, endpoint, False)

__all__ = ["limiter", "configure_rate_limiting", "RateLimitExceeded"]

limiter = Limiter(key_func=get_remote_address, default_limits=["100/minute"])

if not hasattr(limiter, "check_request"):
    limiter.check_request = _compat_check_request  # type: ignore[attr-defined]


def configure_rate_limiting(app: FastAPI) -> None:
    """Attach SlowAPI rate limiting middleware and handlers to the app."""
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)
