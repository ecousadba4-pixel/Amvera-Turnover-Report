from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware

from .errors import RateLimitExceeded


class SlowAPIMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):  # type: ignore[override]
        limiter = getattr(request.app.state, "limiter", None)
        if limiter is not None:
            try:
                await limiter.check_request(request)
            except RateLimitExceeded as exc:
                return await limiter._rate_limit_exceeded_handler(request, exc)
        response = await call_next(request)
        return response


__all__ = ["SlowAPIMiddleware"]
