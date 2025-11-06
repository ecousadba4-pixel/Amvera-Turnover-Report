from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.api.dependencies import DatabaseDsn, require_admin_auth
from app.schemas.enums import DateField, MonthlyMetric, MonthlyRange
from app.schemas.responses import MetricsResponse, MonthlyMetricsResponse
from app.services.metrics import get_metrics, get_monthly_metrics

router = APIRouter(prefix="/api/metrics", tags=["metrics"])


@router.get("", response_model=MetricsResponse)
async def metrics(
    dsn: DatabaseDsn,
    _: str = Depends(require_admin_auth),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    date_field: DateField = Query(default=DateField.created),
) -> MetricsResponse:
    return await get_metrics(
        date_from=date_from,
        date_to=date_to,
        date_field=date_field,
        dsn=dsn,
    )


@router.get("/monthly", response_model=MonthlyMetricsResponse)
async def metrics_monthly(
    dsn: DatabaseDsn,
    _: str = Depends(require_admin_auth),
    metric: MonthlyMetric = Query(...),
    range_: MonthlyRange = Query(default=MonthlyRange.this_year, alias="range"),
    date_field: DateField = Query(default=DateField.created),
) -> MonthlyMetricsResponse:
    return await get_monthly_metrics(
        metric=metric,
        range_=range_,
        date_field=date_field,
        dsn=dsn,
    )


__all__ = ["router"]
