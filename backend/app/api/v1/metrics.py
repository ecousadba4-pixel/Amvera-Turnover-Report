from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.dependencies import require_admin_auth
from app.schemas.enums import DateField, MonthlyMetric, MonthlyRange
from app.schemas.responses import MetricsResponse, MonthlyMetricsResponse
from app.services.metrics import InvalidDateRangeError, get_metrics, get_monthly_metrics

router = APIRouter(prefix="/api/metrics", tags=["metrics"])


@router.get("", response_model=MetricsResponse)
async def metrics(
    _: str = Depends(require_admin_auth),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    date_field: DateField = Query(default=DateField.created),
) -> MetricsResponse:
    if date_from and date_to and date_from > date_to:
        date_from, date_to = date_to, date_from

    try:
        return await get_metrics(date_from=date_from, date_to=date_to, date_field=date_field)
    except InvalidDateRangeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/monthly", response_model=MonthlyMetricsResponse)
async def metrics_monthly(
    _: str = Depends(require_admin_auth),
    metric: MonthlyMetric = Query(...),
    range_: MonthlyRange = Query(default=MonthlyRange.this_year, alias="range"),
    date_field: DateField = Query(default=DateField.created),
) -> MonthlyMetricsResponse:
    return await get_monthly_metrics(metric=metric, range_=range_, date_field=date_field)


__all__ = ["router"]
