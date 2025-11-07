from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass
class RateLimitExceeded(Exception):
    retry_after: Optional[float] = None
    detail: str = "Too Many Requests"


__all__ = ["RateLimitExceeded"]
