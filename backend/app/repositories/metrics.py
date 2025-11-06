from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Mapping, Optional, Sequence

from psycopg import sql

from app.core.dates import (
    CONSUMPTION_DATE_RESOLUTION,
    DateFieldResolution,
    build_filters,
    last_day_of_month,
    month_range,
    resolve_date_field,
)
from app.core.numbers import as_float
from app.db import fetchall, fetchone
from app.db.query_loader import load_query
from app.schemas.enums import DateField, MonthlyRange


@dataclass(frozen=True, slots=True)
class MetricsSummaryRecord:
    bookings_count: int
    lvl2p: int
    avg_check: float
    min_booking: float
    max_booking: float
    avg_stay_days: float
    bonus_spent_sum: float
    revenue: float
    services_amount: float


@dataclass(frozen=True, slots=True)
class ServiceUsageRecord:
    service_type: str
    total_amount: float


@dataclass(frozen=True, slots=True)
class ServicesListingResult:
    items: Sequence[ServiceUsageRecord]
    total_items: int
    total_amount: float


@dataclass(frozen=True, slots=True)
class MonthlyMetricRecord:
    month: date
    revenue: float
    bookings_count: int
    lvl2p: int
    min_booking: Optional[float]
    max_booking: Optional[float]
    avg_check: float
    avg_stay_days: float
    bonus_spent_sum: float
    services_amount: float


@dataclass(frozen=True, slots=True)
class MonthlyServiceRecord:
    month: date
    total_amount: float


def _as_int(value: object) -> int:
    return int(value) if value is not None else 0


def _as_optional_float(value: object) -> Optional[float]:
    return float(value) if value is not None else None


def _coerce_date(value: object) -> Optional[date]:
    if isinstance(value, date):
        return value
    date_method = getattr(value, "date", None)
    if callable(date_method):
        result = date_method()  # type: ignore[misc]
        return result if isinstance(result, date) else None
    return None


def _normalize_service_type(raw: object) -> str:
    value = str(raw or "").strip()
    return value or "Без категории"


async def fetch_metrics_summary(
    *,
    dsn: str,
    date_from: Optional[date],
    date_to: Optional[date],
    date_field: DateField,
) -> MetricsSummaryRecord:
    resolution = resolve_date_field(date_field)
    filters, params = build_filters(resolution, date_from, date_to)
    services_filters, services_params = build_filters(
        CONSUMPTION_DATE_RESOLUTION, date_from, date_to, table_alias="u"
    )
    params.update(services_params)

    query = load_query("metrics_summary.sql").format(
        filters=filters,
        services_filters=services_filters,
    )

    row = await fetchone(dsn, query, params) or {}
    return MetricsSummaryRecord(
        bookings_count=_as_int(row.get("bookings_count")),
        lvl2p=_as_int(row.get("lvl2p")),
        avg_check=as_float(row.get("avg_check")),
        min_booking=as_float(row.get("min_booking")),
        max_booking=as_float(row.get("max_booking")),
        avg_stay_days=as_float(row.get("avg_stay_days")),
        bonus_spent_sum=as_float(row.get("bonus_spent_sum")),
        revenue=as_float(row.get("revenue")),
        services_amount=as_float(row.get("services_amount")),
    )


async def fetch_services_listing(
    *,
    dsn: str,
    date_from: Optional[date],
    date_to: Optional[date],
    page: int,
    page_size: int,
) -> ServicesListingResult:
    filters, params = build_filters(
        CONSUMPTION_DATE_RESOLUTION, date_from, date_to, table_alias="u"
    )
    offset = (page - 1) * page_size
    query = load_query("services_listing.sql").format(filters=filters)
    query_params = {**params, "limit": page_size, "offset": offset}
    rows = await fetchall(dsn, query, query_params) or []

    summary_row: Mapping[str, object] = {}
    items: list[ServiceUsageRecord] = []
    for row in rows:
        if row.get("is_summary"):
            summary_row = row
            continue
        items.append(
            ServiceUsageRecord(
                service_type=_normalize_service_type(row.get("service_type")),
                total_amount=as_float(row.get("total_amount")),
            )
        )

    total_items = _as_int(summary_row.get("total_items")) if summary_row else 0
    total_amount = as_float(summary_row.get("overall_amount")) if summary_row else 0.0

    return ServicesListingResult(items=items, total_items=total_items, total_amount=total_amount)


async def fetch_monthly_metric_rows(
    *,
    dsn: str,
    range_: MonthlyRange,
    date_field: DateField,
) -> Sequence[MonthlyMetricRecord]:
    start_month, end_month = month_range(range_)
    end_date = last_day_of_month(end_month)

    resolution = resolve_date_field(date_field)
    filters, params = build_filters(
        resolution,
        date_from=start_month,
        date_to=end_date,
        table_alias="g",
    )
    services_filters, services_params = build_filters(
        CONSUMPTION_DATE_RESOLUTION,
        date_from=start_month,
        date_to=end_date,
        table_alias="u",
    )
    params.update(services_params)

    query_params = {
        **params,
        "series_start": start_month,
        "series_end": end_month,
    }

    query = load_query("metrics_monthly.sql").format(
        date_column=sql.Identifier(resolution.column),
        filters=filters,
        services_filters=services_filters,
    )

    rows = await fetchall(dsn, query, query_params) or []
    result: list[MonthlyMetricRecord] = []
    for row in rows:
        month_start = _coerce_date(row.get("month_start"))
        if not month_start:
            continue
        result.append(
            MonthlyMetricRecord(
                month=month_start,
                revenue=as_float(row.get("revenue")),
                bookings_count=_as_int(row.get("bookings_count")),
                lvl2p=_as_int(row.get("lvl2p")),
                min_booking=_as_optional_float(row.get("min_booking")),
                max_booking=_as_optional_float(row.get("max_booking")),
                avg_check=as_float(row.get("avg_check")),
                avg_stay_days=as_float(row.get("avg_stay_days")),
                bonus_spent_sum=as_float(row.get("bonus_spent_sum")),
                services_amount=as_float(row.get("services_amount")),
            )
        )

    return result


async def fetch_monthly_service_rows(
    *,
    dsn: str,
    service_type: str,
    range_: MonthlyRange,
) -> Sequence[MonthlyServiceRecord]:
    start_month, end_month = month_range(range_)
    end_date = last_day_of_month(end_month)

    filters, params = build_filters(
        CONSUMPTION_DATE_RESOLUTION,
        date_from=start_month,
        date_to=end_date,
        table_alias="u",
    )

    params.update(
        {
            "series_start": start_month,
            "series_end": end_month,
            "service_type": service_type,
        }
    )

    service_clause = sql.SQL(
        "\n          AND COALESCE(u.uslugi_type, 'Без категории') = %(service_type)s"
    )

    query = load_query("services_monthly.sql").format(
        filters=filters,
        service_filter=service_clause,
    )

    rows = await fetchall(dsn, query, params) or []
    result: list[MonthlyServiceRecord] = []
    for row in rows:
        month_start = _coerce_date(row.get("month_start"))
        if not month_start:
            continue
        result.append(
            MonthlyServiceRecord(
                month=month_start,
                total_amount=as_float(row.get("total_amount")),
            )
        )

    return result


__all__ = [
    "MetricsSummaryRecord",
    "MonthlyMetricRecord",
    "MonthlyServiceRecord",
    "ServiceUsageRecord",
    "ServicesListingResult",
    "fetch_metrics_summary",
    "fetch_monthly_metric_rows",
    "fetch_monthly_service_rows",
    "fetch_services_listing",
]
