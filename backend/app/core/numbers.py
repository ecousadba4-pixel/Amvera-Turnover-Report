from __future__ import annotations

from typing import Any


def as_float(value: Any) -> float:
    return float(value if value is not None else 0)


__all__ = ["as_float"]
