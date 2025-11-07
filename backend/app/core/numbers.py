from __future__ import annotations

from decimal import Decimal
from typing import Union

NumericValue = Union[int, float, Decimal, str, None]


def as_float(value: NumericValue) -> float:
    """Convert value to float, defaulting to 0.0 when conversion fails."""
    if value is None:
        return 0.0
    if isinstance(value, (int, float, Decimal)):
        return float(value)
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return 0.0
        try:
            return float(stripped)
        except ValueError:
            return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):  # pragma: no cover - defensive branch
        return 0.0


__all__ = ["as_float"]
