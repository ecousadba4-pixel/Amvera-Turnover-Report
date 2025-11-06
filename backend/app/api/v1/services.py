from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.dependencies import require_admin_auth
from app.schemas.enums import MonthlyRange
from app.schemas.responses import MonthlyServiceResponse, ServicesResponse
from app.services.metrics import get_monthly_services, get_services, InvalidDateRangeError

router = APIRouter(prefix="/api/services", tags=["services"])


@router.get("", response_model=ServicesResponse)
async def services(
    _: str = Depends(require_admin_auth),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=1000),
) -> ServicesResponse:
    try:
        return await get_services(
            date_from=date_from,
            date_to=date_to,
            page=page,
            page_size=page_size,
        )
    except InvalidDateRangeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/monthly", response_model=MonthlyServiceResponse)
async def services_monthly(
    _: str = Depends(require_admin_auth),
    service_type: str = Query(..., min_length=1),
    range_: MonthlyRange = Query(default=MonthlyRange.this_year, alias="range"),
) -> MonthlyServiceResponse:
    try:
        return await get_monthly_services(service_type=service_type, range_=range_)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


__all__ = ["router"]
