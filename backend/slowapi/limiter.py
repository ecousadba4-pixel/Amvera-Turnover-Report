from __future__ import annotations

import asyncio
import math
import time
from collections import deque
from dataclasses import dataclass
from typing import Callable, Deque, Dict, Iterable, List, Optional

from fastapi import Request
from starlette.responses import JSONResponse

from .errors import RateLimitExceeded

LimitKey = tuple[str, str]


@dataclass(frozen=True)
class RateLimit:
    count: int
    seconds: float

    @property
    def signature(self) -> str:
        return f"{self.count}:{int(self.seconds)}"


def _parse_period(period: str) -> float:
    normalized = period.strip().lower()
    mapping = {
        "s": 1,
        "sec": 1,
        "second": 1,
        "seconds": 1,
        "m": 60,
        "min": 60,
        "minute": 60,
        "minutes": 60,
        "h": 3600,
        "hour": 3600,
        "hours": 3600,
        "d": 86400,
        "day": 86400,
        "days": 86400,
    }
    if normalized not in mapping:
        raise ValueError(f"Unsupported rate limit period: {period}")
    return float(mapping[normalized])


def _parse_limit(limit_value: str) -> RateLimit:
    if "/" not in limit_value:
        raise ValueError(f"Invalid rate limit format: {limit_value}")
    count_part, period_part = limit_value.split("/", 1)
    count = int(count_part.strip())
    seconds = _parse_period(period_part)
    return RateLimit(count=count, seconds=seconds)


class Limiter:
    """A lightweight in-memory request rate limiter."""

    def __init__(
        self,
        *,
        key_func: Callable[[Request], str],
        default_limits: Optional[Iterable[str]] = None,
    ) -> None:
        self.key_func = key_func
        self._default_limits: List[RateLimit] = [
            _parse_limit(value) for value in (default_limits or [])
        ]
        self._route_limits: Dict[object, List[RateLimit]] = {}
        self._hits: Dict[tuple[str, str], Deque[float]] = {}
        self._lock = asyncio.Lock()

    def limit(self, limit_value: str) -> Callable[[Callable[..., object]], Callable[..., object]]:
        limit = _parse_limit(limit_value)

        def decorator(func: Callable[..., object]) -> Callable[..., object]:
            limits = self._route_limits.setdefault(func, [])
            limits.append(limit)
            return func

        return decorator

    async def check_request(self, request: Request) -> None:
        key = self.key_func(request)
        endpoint = request.scope.get("endpoint")
        limits: List[RateLimit] = list(self._default_limits)
        if endpoint is not None:
            limits.extend(self._route_limits.get(endpoint, []))

        async with self._lock:
            for limit in limits:
                bucket_id = self._resolve_bucket_id(endpoint, limit)
                self._enforce_limit(bucket_id, key, limit)

    def reset(self) -> None:
        self._hits.clear()

    async def _rate_limit_exceeded_handler(
        self, request: Request, exc: RateLimitExceeded
    ) -> JSONResponse:
        headers = {}
        if exc.retry_after is not None:
            headers["Retry-After"] = str(int(math.ceil(exc.retry_after)))
        return JSONResponse(status_code=429, content={"detail": exc.detail}, headers=headers)

    def _resolve_bucket_id(self, endpoint: object | None, limit: RateLimit) -> str:
        if endpoint is None:
            return f"default:{limit.signature}"
        return f"route:{id(endpoint)}:{limit.signature}"

    def _enforce_limit(self, bucket_id: str, key: str, limit: RateLimit) -> None:
        now = time.monotonic()
        storage_key = (bucket_id, key)
        hits = self._hits.setdefault(storage_key, deque())

        while hits and now - hits[0] >= limit.seconds:
            hits.popleft()

        if len(hits) >= limit.count:
            oldest = hits[0]
            retry_after = max(0.0, limit.seconds - (now - oldest))
            raise RateLimitExceeded(retry_after=retry_after)

        hits.append(now)


__all__ = ["Limiter"]
