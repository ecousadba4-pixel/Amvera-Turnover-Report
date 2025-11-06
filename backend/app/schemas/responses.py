from __future__ import annotations

from datetime import date
from typing import Optional

from pydantic import BaseModel

from app.schemas.enums import MonthlyMetric, MonthlyRange


class MetricsResponse(BaseModel):
    used_field: str
    used_reason: str
    date_from: Optional[date]
    date_to: Optional[date]
    revenue: float
    avg_check: float
    bookings_count: int
    level2plus_share: float
    min_booking: float
    max_booking: float
    avg_stay_days: float
    bonus_payment_share: float
    services_share: float


class ServiceItem(BaseModel):
    service_type: str
    total_amount: float
    share: float


class PaginationInfo(BaseModel):
    page: int
    page_size: int
    total_items: int


class ServicesResponse(BaseModel):
    used_field: str
    used_reason: str
    date_from: Optional[date]
    date_to: Optional[date]
    total_amount: float
    items: list[ServiceItem]
    pagination: PaginationInfo


class MonthlyMetricPoint(BaseModel):
    month: date
    value: float


class MonthlyMetricsResponse(BaseModel):
    metric: MonthlyMetric
    range: MonthlyRange
    date_field: str
    points: list[MonthlyMetricPoint]
    aggregate: Optional[float] = None


class MonthlyServicePoint(BaseModel):
    month: date
    value: float


class MonthlyServiceResponse(BaseModel):
    service_type: str
    range: MonthlyRange
    points: list[MonthlyServicePoint]
    aggregate: Optional[float] = None


__all__ = [
    "MetricsResponse",
    "MonthlyMetricPoint",
    "MonthlyMetricsResponse",
    "MonthlyServicePoint",
    "MonthlyServiceResponse",
    "PaginationInfo",
    "ServiceItem",
    "ServicesResponse",
]
