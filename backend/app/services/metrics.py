from __future__ import annotations

from datetime import date
from typing import Optional

from psycopg import sql

from app.core.dates import (
    CONSUMPTION_DATE_RESOLUTION,
    build_filters,
    last_day_of_month,
    month_range,
    resolve_date_field,
)
from app.core.numbers import as_float
from app.db import fetchall, fetchone
from app.db.query_loader import load_query
from app.schemas.enums import DateField, MonthlyMetric, MonthlyRange
from app.schemas.responses import (
    MetricsResponse,
    MonthlyMetricPoint,
    MonthlyMetricsResponse,
    MonthlyServicePoint,
    MonthlyServiceResponse,
    PaginationInfo,
    ServiceItem,
    ServicesResponse,
)
from app.settings import get_settings


async def get_metrics(
    *,
    date_from: Optional[date],
    date_to: Optional[date],
    date_field: DateField,
) -> MetricsResponse:
    date_from, date_to = _normalize_date_range(date_from, date_to)

    settings = get_settings()
    dsn = settings.database_url
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

    count = int(row.get("bookings_count", 0))
    lvl2p = int(row.get("lvl2p", 0))
    share = float(lvl2p / count) if count else 0.0
    avg_stay_days = as_float(row.get("avg_stay_days"))
    bonus_spent_sum = as_float(row.get("bonus_spent_sum"))
    revenue_total = as_float(row.get("revenue"))
    bonus_share = float(bonus_spent_sum / revenue_total) if revenue_total else 0.0
    services_amount = as_float(row.get("services_amount"))
    services_share = float(services_amount / revenue_total) if revenue_total else 0.0

    return MetricsResponse(
        used_field=resolution.column,
        used_reason=resolution.reason,
        date_from=date_from,
        date_to=date_to,
        revenue=revenue_total,
        avg_check=as_float(row.get("avg_check")),
        bookings_count=count,
        level2plus_share=share,
        min_booking=as_float(row.get("min_booking")),
        max_booking=as_float(row.get("max_booking")),
        avg_stay_days=avg_stay_days,
        bonus_payment_share=bonus_share,
        services_share=services_share,
    )


async def get_services(
    *,
    date_from: Optional[date],
    date_to: Optional[date],
    page: int,
    page_size: int,
) -> ServicesResponse:
    date_from, date_to = _normalize_date_range(date_from, date_to)

    settings = get_settings()
    dsn = settings.database_url
    resolution = CONSUMPTION_DATE_RESOLUTION
    filters, params = build_filters(resolution, date_from, date_to, table_alias="u")

    offset = (page - 1) * page_size

    query = load_query("services_listing.sql").format(filters=filters)

    query_params = {**params, "limit": page_size, "offset": offset}

    rows = await fetchall(dsn, query, query_params) or []

    summary_row: dict[str, object] = {}
    raw_items: list[dict[str, object]] = []

    for row in rows:
        if row.get("is_summary"):
            summary_row = row
            continue
        raw_items.append(
            {
                "service_type": str(row.get("service_type") or "Без категории"),
                "total_amount": as_float(row.get("total_amount")),
            }
        )

    total_items = int(summary_row.get("total_items", 0)) if summary_row else 0
    total_amount = as_float(summary_row.get("overall_amount")) if summary_row else 0.0

    items = [
        ServiceItem(
            service_type=item["service_type"],
            total_amount=item["total_amount"],
            share=float(item["total_amount"] / total_amount) if total_amount else 0.0,
        )
        for item in raw_items
    ]

    return ServicesResponse(
        used_field=resolution.column,
        used_reason=resolution.reason,
        date_from=date_from,
        date_to=date_to,
        total_amount=total_amount,
        items=items,
        pagination=PaginationInfo(
            page=page,
            page_size=page_size,
            total_items=total_items,
        ),
    )


async def get_monthly_metrics(
    *,
    metric: MonthlyMetric,
    range_: MonthlyRange,
    date_field: DateField,
) -> MonthlyMetricsResponse:
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

    settings = get_settings()
    dsn = settings.database_url
    rows = await fetchall(dsn, query, query_params) or []

    points: list[MonthlyMetricPoint] = []

    revenue_sum = 0.0
    bookings_sum = 0
    bookings_with_data = 0
    revenue_with_bookings_sum = 0.0
    lvl2p_sum = 0
    avg_stay_weighted_sum = 0.0
    avg_stay_weight = 0
    min_booking_value: Optional[float] = None
    max_booking_value: Optional[float] = None
    bonus_spent_sum_total = 0.0
    bonus_revenue_total = 0.0
    services_amount_total = 0.0
    services_revenue_total = 0.0

    for row in rows:
        month_start = row.get("month_start")
        if not isinstance(month_start, date):
            continue

        revenue = as_float(row.get("revenue"))
        bookings_count = int(row.get("bookings_count", 0) or 0)
        lvl2p = int(row.get("lvl2p", 0) or 0)
        bonus_spent_sum = as_float(row.get("bonus_spent_sum"))
        services_amount = as_float(row.get("services_amount"))
        avg_stay_days_value = as_float(row.get("avg_stay_days"))

        revenue_sum += revenue
        bookings_sum += bookings_count
        if bookings_count > 0:
            bookings_with_data += bookings_count
            revenue_with_bookings_sum += revenue
            lvl2p_sum += lvl2p
            avg_stay_weighted_sum += avg_stay_days_value * bookings_count
            avg_stay_weight += bookings_count

            min_candidate = as_float(row.get("min_booking"))
            max_candidate = as_float(row.get("max_booking"))

            if min_candidate is not None:
                min_booking_value = min_candidate if min_booking_value is None else min(min_booking_value, min_candidate)

            if max_candidate is not None:
                max_booking_value = max_candidate if max_booking_value is None else max(max_booking_value, max_candidate)

        if revenue > 0:
            bonus_spent_sum_total += bonus_spent_sum
            bonus_revenue_total += revenue
            services_amount_total += services_amount
            services_revenue_total += revenue

        points.append(
            MonthlyMetricPoint(
                month=month_start,
                value=_resolve_monthly_value(
                    metric=metric,
                    revenue=revenue,
                    bookings_count=bookings_count,
                    lvl2p=lvl2p,
                    min_booking=as_float(row.get("min_booking")),
                    max_booking=as_float(row.get("max_booking")),
                    avg_check=as_float(row.get("avg_check")),
                    avg_stay_days=avg_stay_days_value,
                    bonus_spent_sum=bonus_spent_sum,
                    services_amount=services_amount,
                ),
            )
        )

    aggregate_value = _calculate_monthly_aggregate(
        metric=metric,
        points=points,
        revenue_sum=revenue_sum,
        bookings_sum=bookings_sum,
        bookings_with_data=bookings_with_data,
        revenue_with_bookings_sum=revenue_with_bookings_sum,
        lvl2p_sum=lvl2p_sum,
        avg_stay_weighted_sum=avg_stay_weighted_sum,
        avg_stay_weight=avg_stay_weight,
        min_booking_value=min_booking_value,
        max_booking_value=max_booking_value,
        bonus_spent_sum_total=bonus_spent_sum_total,
        bonus_revenue_total=bonus_revenue_total,
        services_amount_total=services_amount_total,
        services_revenue_total=services_revenue_total,
    )

    return MonthlyMetricsResponse(
        metric=metric,
        range=range_,
        date_field=resolution.column,
        points=points,
        aggregate=aggregate_value,
    )


async def get_monthly_services(
    *,
    service_type: str,
    range_: MonthlyRange,
) -> MonthlyServiceResponse:
    normalized_service = service_type.strip()
    if not normalized_service:
        raise ValueError("service_type must be provided")

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
            "service_type": normalized_service,
        }
    )

    service_clause = sql.SQL(
        "\n          AND COALESCE(u.uslugi_type, 'Без категории') = %(service_type)s"
    )

    query = load_query("services_monthly.sql").format(
        filters=filters,
        service_filter=service_clause,
    )

    settings = get_settings()
    dsn = settings.database_url
    rows = await fetchall(dsn, query, params) or []

    points: list[MonthlyServicePoint] = []
    aggregate_value = 0.0

    for row in rows:
        month_start = row.get("month_start")
        value = as_float(row.get("total_amount"))
        aggregate_value += value
        if isinstance(month_start, date):
            month_value = month_start
        else:
            month_value = month_start.date() if hasattr(month_start, "date") else month_start
        points.append(MonthlyServicePoint(month=month_value, value=value))

    return MonthlyServiceResponse(
        service_type=normalized_service,
        range=range_,
        points=points,
        aggregate=aggregate_value,
    )


def _normalize_date_range(
    date_from: Optional[date], date_to: Optional[date]
) -> tuple[Optional[date], Optional[date]]:
    if date_from and date_to and date_from > date_to:
        return date_to, date_from
    return date_from, date_to


def _resolve_monthly_value(
    *,
    metric: MonthlyMetric,
    revenue: float,
    bookings_count: int,
    lvl2p: int,
    min_booking: float,
    max_booking: float,
    avg_check: float,
    avg_stay_days: float,
    bonus_spent_sum: float,
    services_amount: float,
) -> float:
    if metric is MonthlyMetric.revenue:
        return revenue
    if metric is MonthlyMetric.avg_check:
        return avg_check
    if metric is MonthlyMetric.bookings_count:
        return float(bookings_count)
    if metric is MonthlyMetric.level2plus_share:
        return float(lvl2p / bookings_count) if bookings_count else 0.0
    if metric is MonthlyMetric.min_booking:
        return min_booking if bookings_count else 0.0
    if metric is MonthlyMetric.max_booking:
        return max_booking if bookings_count else 0.0
    if metric is MonthlyMetric.avg_stay_days:
        return avg_stay_days
    if metric is MonthlyMetric.bonus_payment_share:
        return float(bonus_spent_sum / revenue) if revenue else 0.0
    if metric is MonthlyMetric.services_share:
        return float(services_amount / revenue) if revenue else 0.0
    return 0.0


def _calculate_monthly_aggregate(
    *,
    metric: MonthlyMetric,
    points: list[MonthlyMetricPoint],
    revenue_sum: float,
    bookings_sum: int,
    bookings_with_data: int,
    revenue_with_bookings_sum: float,
    lvl2p_sum: int,
    avg_stay_weighted_sum: float,
    avg_stay_weight: int,
    min_booking_value: Optional[float],
    max_booking_value: Optional[float],
    bonus_spent_sum_total: float,
    bonus_revenue_total: float,
    services_amount_total: float,
    services_revenue_total: float,
) -> Optional[float]:
    if metric is MonthlyMetric.revenue:
        return revenue_sum
    if metric is MonthlyMetric.bookings_count:
        return float(bookings_sum)
    if metric is MonthlyMetric.avg_check:
        if bookings_with_data > 0:
            return revenue_with_bookings_sum / bookings_with_data
        return 0.0 if points else None
    if metric is MonthlyMetric.level2plus_share:
        if bookings_with_data > 0:
            return float(lvl2p_sum / bookings_with_data)
        return 0.0 if points else None
    if metric is MonthlyMetric.min_booking:
        if min_booking_value is not None:
            return min_booking_value
        return 0.0 if points else None
    if metric is MonthlyMetric.max_booking:
        if max_booking_value is not None:
            return max_booking_value
        return 0.0 if points else None
    if metric is MonthlyMetric.avg_stay_days:
        if avg_stay_weight > 0:
            return avg_stay_weighted_sum / avg_stay_weight
        return 0.0 if points else None
    if metric is MonthlyMetric.bonus_payment_share:
        if bonus_revenue_total > 0:
            return float(bonus_spent_sum_total / bonus_revenue_total)
        return 0.0 if points else None
    if metric is MonthlyMetric.services_share:
        if services_revenue_total > 0:
            return float(services_amount_total / services_revenue_total)
        return 0.0 if points else None
    return None


__all__ = [
    "get_metrics",
    "get_services",
    "get_monthly_metrics",
    "get_monthly_services",
]
