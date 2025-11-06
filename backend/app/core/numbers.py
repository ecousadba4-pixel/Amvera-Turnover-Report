from __future__ import annotations


def as_float(value: object) -> float:
    """Convert value to float, defaulting to 0.0 if None."""
    return float(value if value is not None else 0)


__all__ = ["as_float"]
