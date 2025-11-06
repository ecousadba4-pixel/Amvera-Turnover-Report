from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Optional, Sequence

from app.core.dates import CONSUMPTION_DATE_RESOLUTION, resolve_date_field
from app.repositories.metrics import (
    MonthlyMetricRecord,
    ServicesListingResult,
    fetch_metrics_summary,
    fetch_monthly_metric_rows,
    fetch_monthly_service_rows,
    fetch_services_listing,
)
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


async def get_metrics(
    *,
    date_from: Optional[date],
    date_to: Optional[date],
    date_field: DateField,
) -> MetricsResponse:
    date_from, date_to = _normalize_date_range(date_from, date_to)
    summary = await fetch_metrics_summary(
        date_from=date_from,
        date_to=date_to,
        date_field=date_field,
    )

    resolution = resolve_date_field(date_field)
    share = _calculate_share(summary.lvl2p, summary.bookings_count)
    revenue_total = summary.revenue

    return MetricsResponse(
        used_field=resolution.column,
        used_reason=resolution.reason,
        date_from=date_from,
        date_to=date_to,
        revenue=revenue_total,
        avg_check=summary.avg_check,
        bookings_count=summary.bookings_count,
        level2plus_share=share,
        min_booking=summary.min_booking,
        max_booking=summary.max_booking,
        avg_stay_days=summary.avg_stay_days,
        bonus_payment_share=_calculate_share(summary.bonus_spent_sum, revenue_total),
        services_share=_calculate_share(summary.services_amount, revenue_total),
    )


async def get_services(
    *,
    date_from: Optional[date],
    date_to: Optional[date],
    page: int,
    page_size: int,
) -> ServicesResponse:
    date_from, date_to = _normalize_date_range(date_from, date_to)
    listing = await fetch_services_listing(
        date_from=date_from,
        date_to=date_to,
        page=page,
        page_size=page_size,
    )

    items = _convert_services(listing)
    return ServicesResponse(
        used_field=CONSUMPTION_DATE_RESOLUTION.column,
        used_reason=CONSUMPTION_DATE_RESOLUTION.reason,
        date_from=date_from,
        date_to=date_to,
        total_amount=listing.total_amount,
        items=items,
        pagination=PaginationInfo(
            page=page,
            page_size=page_size,
            total_items=listing.total_items,
        ),
    )


async def get_monthly_metrics(
    *,
    metric: MonthlyMetric,
    range_: MonthlyRange,
    date_field: DateField,
) -> MonthlyMetricsResponse:
    rows = await fetch_monthly_metric_rows(
        range_=range_,
        date_field=date_field,
    )

    resolution = resolve_date_field(date_field)
    aggregation = MonthlyAggregation()
    points: list[MonthlyMetricPoint] = []

    for record in rows:
        aggregation.update(record)
        points.append(
            MonthlyMetricPoint(
                month=record.month,
                value=_resolve_monthly_value(metric, record),
            )
        )

    aggregate_value = aggregation.finalize(metric, has_points=bool(points))

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

    rows = await fetch_monthly_service_rows(
        service_type=normalized_service,
        range_=range_,
    )

    points = [
        MonthlyServicePoint(month=record.month, value=record.total_amount)
        for record in rows
    ]

    return MonthlyServiceResponse(
        service_type=normalized_service,
        range=range_,
        points=points,
        aggregate=sum(record.total_amount for record in rows),
    )


def _normalize_date_range(
    date_from: Optional[date], date_to: Optional[date]
) -> tuple[Optional[date], Optional[date]]:
    """Normalize date range by swapping dates if from > to."""
    if date_from and date_to and date_from > date_to:
        return date_to, date_from
    return date_from, date_to


def _calculate_share(numerator: float, denominator: float) -> float:
    """Calculate share as numerator/denominator, returning 0.0 if denominator is zero."""
    return float(numerator / denominator) if denominator else 0.0


def _convert_services(listing: ServicesListingResult) -> Sequence[ServiceItem]:
    total_amount = listing.total_amount
    return [
        ServiceItem(
            service_type=item.service_type,
            total_amount=item.total_amount,
            share=_calculate_share(item.total_amount, total_amount),
        )
        for item in listing.items
    ]


def _resolve_monthly_value(metric: MonthlyMetric, record: MonthlyMetricRecord) -> float:
    match metric:
        case MonthlyMetric.revenue:
            return record.revenue
        case MonthlyMetric.avg_check:
            return record.avg_check
        case MonthlyMetric.bookings_count:
            return float(record.bookings_count)
        case MonthlyMetric.level2plus_share:
            return _calculate_share(record.lvl2p, record.bookings_count)
        case MonthlyMetric.min_booking:
            return record.min_booking if record.bookings_count else 0.0
        case MonthlyMetric.max_booking:
            return record.max_booking if record.bookings_count else 0.0
        case MonthlyMetric.avg_stay_days:
            return record.avg_stay_days
        case MonthlyMetric.bonus_payment_share:
            return _calculate_share(record.bonus_spent_sum, record.revenue)
        case MonthlyMetric.services_share:
            return _calculate_share(record.services_amount, record.revenue)
        case _:
            return 0.0


@dataclass(slots=True)
class MonthlyAggregation:
    revenue_sum: float = 0.0
    bookings_sum: int = 0
    bookings_with_data: int = 0
    revenue_with_bookings_sum: float = 0.0
    lvl2p_sum: int = 0
    avg_stay_weighted_sum: float = 0.0
    avg_stay_weight: int = 0
    min_booking_value: Optional[float] = None
    max_booking_value: Optional[float] = None
    bonus_spent_sum_total: float = 0.0
    bonus_revenue_total: float = 0.0
    services_amount_total: float = 0.0
    services_revenue_total: float = 0.0

    def update(self, record: MonthlyMetricRecord) -> None:
        self.revenue_sum += record.revenue
        self.bookings_sum += record.bookings_count

        if record.bookings_count > 0:
            self.bookings_with_data += record.bookings_count
            self.revenue_with_bookings_sum += record.revenue
            self.lvl2p_sum += record.lvl2p
            self.avg_stay_weighted_sum += record.avg_stay_days * record.bookings_count
            self.avg_stay_weight += record.bookings_count

            if record.min_booking is not None:
                self.min_booking_value = (
                    record.min_booking
                    if self.min_booking_value is None
                    else min(self.min_booking_value, record.min_booking)
                )

            if record.max_booking is not None:
                self.max_booking_value = (
                    record.max_booking
                    if self.max_booking_value is None
                    else max(self.max_booking_value, record.max_booking)
                )

        if record.revenue > 0:
            self.bonus_spent_sum_total += record.bonus_spent_sum
            self.bonus_revenue_total += record.revenue
            self.services_amount_total += record.services_amount
            self.services_revenue_total += record.revenue

    def finalize(self, metric: MonthlyMetric, *, has_points: bool) -> Optional[float]:
        metric_handlers = {
            MonthlyMetric.revenue: lambda: self.revenue_sum,
            MonthlyMetric.bookings_count: lambda: float(self.bookings_sum),
            MonthlyMetric.avg_check: lambda: (
                self.revenue_with_bookings_sum / self.bookings_with_data
                if self.bookings_with_data > 0
                else 0.0 if has_points else None
            ),
            MonthlyMetric.level2plus_share: lambda: (
                _calculate_share(self.lvl2p_sum, self.bookings_with_data)
                if self.bookings_with_data > 0
                else 0.0 if has_points else None
            ),
            MonthlyMetric.min_booking: lambda: (
                self.min_booking_value
                if self.min_booking_value is not None
                else 0.0 if has_points else None
            ),
            MonthlyMetric.max_booking: lambda: (
                self.max_booking_value
                if self.max_booking_value is not None
                else 0.0 if has_points else None
            ),
            MonthlyMetric.avg_stay_days: lambda: (
                self.avg_stay_weighted_sum / self.avg_stay_weight
                if self.avg_stay_weight > 0
                else 0.0 if has_points else None
            ),
            MonthlyMetric.bonus_payment_share: lambda: (
                _calculate_share(self.bonus_spent_sum_total, self.bonus_revenue_total)
                if self.bonus_revenue_total > 0
                else 0.0 if has_points else None
            ),
            MonthlyMetric.services_share: lambda: (
                _calculate_share(self.services_amount_total, self.services_revenue_total)
                if self.services_revenue_total > 0
                else 0.0 if has_points else None
            ),
        }

        handler = metric_handlers.get(metric)
        return handler() if handler else None


__all__ = [
    "get_metrics",
    "get_services",
    "get_monthly_metrics",
    "get_monthly_services",
]
