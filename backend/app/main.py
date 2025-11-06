from __future__ import annotations
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from enum import Enum
from hmac import compare_digest
from typing import Annotated, Optional, Tuple

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.db import close_all_pools, fetchall, fetchone
from app.settings import get_settings
from psycopg import sql

settings = get_settings()
ADMIN_HASH = settings.admin_password_sha256.lower()

@asynccontextmanager
async def lifespan(_: FastAPI):
    """Manage global resources for the application lifecycle."""

    try:
        yield
    finally:
        await close_all_pools()


app = FastAPI(title="U4S Revenue API", version="1.0.0", lifespan=lifespan)

MIDNIGHT = time(hour=0, minute=0)


class DateField(str, Enum):
    created = "created"
    checkin = "checkin"

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


AuthHeader = Annotated[Optional[str], Header(alias="X-Auth-Hash", convert_underscores=False)]


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


class MonthlyRange(str, Enum):
    this_year = "this_year"
    last_12_months = "last_12_months"


class MonthlyMetric(str, Enum):
    revenue = "revenue"
    avg_check = "avg_check"
    bookings_count = "bookings_count"
    level2plus_share = "level2plus_share"
    min_booking = "min_booking"
    max_booking = "max_booking"
    avg_stay_days = "avg_stay_days"
    bonus_payment_share = "bonus_payment_share"
    services_share = "services_share"


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


@dataclass(frozen=True)
class DateFieldResolution:
    column: str
    reason: str


def require_admin_auth(x_auth_hash: AuthHeader) -> str:
    """Validate the admin hash header and return the normalized value."""

    if not x_auth_hash:
        raise HTTPException(status_code=401, detail="Missing auth")

    normalized = x_auth_hash.strip().lower()
    if not normalized:
        raise HTTPException(status_code=401, detail="Missing auth")

    if not compare_digest(normalized, ADMIN_HASH):
        raise HTTPException(status_code=403, detail="Forbidden")

    return normalized


# CORS
origins = [o.strip() for o in settings.cors_allow_origins.split(",") if o.strip()]
if origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
        allow_credentials=False,
    )

_DATE_FIELD_RESOLUTIONS = {
    DateField.checkin: DateFieldResolution("checkin_date", "checkin_date"),
    DateField.created: DateFieldResolution("created_at", "created_at"),
}


CONSUMPTION_DATE_RESOLUTION = DateFieldResolution("consumption_date", "consumption_date")


def _resolve_date_field(wanted: DateField) -> DateFieldResolution:
    return _DATE_FIELD_RESOLUTIONS.get(wanted, _DATE_FIELD_RESOLUTIONS[DateField.created])

@app.get("/health")
def health():
    return {"ok": True, "env": settings.app_env}

def _build_filters(
    resolution: DateFieldResolution,
    date_from: Optional[date],
    date_to: Optional[date],
    *,
    table_alias: Optional[str] = None,
) -> tuple[sql.Composable, dict[str, datetime]]:
    clauses: list[sql.Composable] = []
    params: dict[str, datetime] = {}

    if table_alias:
        column_sql = sql.SQL("{}.{}").format(
            sql.Identifier(table_alias), sql.Identifier(resolution.column)
        )
    else:
        column_sql = sql.Identifier(resolution.column)

    if date_from:
        clauses.append(sql.SQL("AND {} >= %(from)s").format(column_sql))
        params["from"] = datetime.combine(date_from, MIDNIGHT)

    if date_to:
        clauses.append(sql.SQL("AND {} < %(to)s").format(column_sql))
        params["to"] = datetime.combine(date_to + timedelta(days=1), MIDNIGHT)

    if clauses:
        filters = sql.SQL("\n          ").join(clauses)
    else:
        filters = sql.SQL("")

    return filters, params


def _as_float(value: object) -> float:
    return float(value if value is not None else 0)


def _add_months(base: date, months: int) -> date:
    year = base.year + (base.month - 1 + months) // 12
    month = (base.month - 1 + months) % 12 + 1
    return date(year, month, 1)


def _month_range(boundary: MonthlyRange) -> Tuple[date, date]:
    today = date.today()
    current_month = date(today.year, today.month, 1)

    if boundary is MonthlyRange.this_year:
        start_month = date(today.year, 1, 1)
    else:
        start_month = _add_months(current_month, -11)

    return start_month, current_month


def _last_day_of_month(month_start: date) -> date:
    next_month = _add_months(month_start, 1)
    return next_month - timedelta(days=1)


@app.get("/api/metrics", response_model=MetricsResponse)
async def metrics(
    _: str = Depends(require_admin_auth),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    date_field: DateField = Query(default=DateField.created),
) -> MetricsResponse:
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=422, detail="date_from must be before or equal to date_to")

    dsn = settings.database_url
    resolution = _resolve_date_field(date_field)
    filters, params = _build_filters(resolution, date_from, date_to)
    services_filters, services_params = _build_filters(
        CONSUMPTION_DATE_RESOLUTION, date_from, date_to, table_alias="u"
    )
    params.update(services_params)

    query = sql.SQL(
        """
      WITH base AS (
        SELECT
          g.total_amount,
          g.loyalty_level,
          g.created_at,
          g.checkin_date,
          g.bonus_spent
        FROM guests AS g
        WHERE 1=1
          {filters}
      )
      SELECT
        COUNT(*)::int AS bookings_count,
        COALESCE(SUM(total_amount), 0)::numeric AS revenue,
        COALESCE(MIN(total_amount), 0)::numeric AS min_booking,
        COALESCE(MAX(total_amount), 0)::numeric AS max_booking,
        COALESCE(AVG(total_amount), 0)::numeric AS avg_check,
        COALESCE(SUM(CASE WHEN loyalty_level IN ('2 СЕЗОНА','3 СЕЗОНА','4 СЕЗОНА') THEN 1 ELSE 0 END), 0)::int AS lvl2p,
        COALESCE(AVG((created_at::date - checkin_date)::numeric), 0)::numeric AS avg_stay_days,
        COALESCE(SUM(bonus_spent), 0)::numeric AS bonus_spent_sum,
        (
          SELECT COALESCE(SUM(u.total_amount), 0)::numeric
          FROM uslugi_daily_mv AS u
          WHERE 1=1
            {services_filters}
        ) AS services_amount
      FROM base
    """
    ).format(filters=filters, services_filters=services_filters)

    row = await fetchone(dsn, query, params) or {}

    count = int(row.get("bookings_count", 0))
    lvl2p = int(row.get("lvl2p", 0))
    share = float(lvl2p / count) if count else 0.0
    avg_stay_days = _as_float(row.get("avg_stay_days"))
    bonus_spent_sum = _as_float(row.get("bonus_spent_sum"))
    revenue_total = _as_float(row.get("revenue"))
    bonus_share = float(bonus_spent_sum / revenue_total) if revenue_total else 0.0
    services_amount = _as_float(row.get("services_amount"))
    services_share = float(services_amount / revenue_total) if revenue_total else 0.0

    return MetricsResponse(
        used_field=resolution.column,
        used_reason=resolution.reason,
        date_from=date_from,
        date_to=date_to,
        revenue=revenue_total,
        avg_check=_as_float(row.get("avg_check")),
        bookings_count=count,
        level2plus_share=share,
        min_booking=_as_float(row.get("min_booking")),
        max_booking=_as_float(row.get("max_booking")),
        avg_stay_days=avg_stay_days,
        bonus_payment_share=bonus_share,
        services_share=services_share,
    )


@app.get("/api/services", response_model=ServicesResponse)
async def services(
    _: str = Depends(require_admin_auth),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    date_field: DateField = Query(default=DateField.created),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=1000),
) -> ServicesResponse:
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=422, detail="date_from must be before or equal to date_to")

    dsn = settings.database_url
    resolution = CONSUMPTION_DATE_RESOLUTION
    filters, params = _build_filters(resolution, date_from, date_to, table_alias="u")

    offset = (page - 1) * page_size

    query = sql.SQL(
        """
      WITH aggregated AS (
        SELECT
          COALESCE(u.uslugi_type, 'Без категории') AS service_type,
          COALESCE(SUM(u.total_amount), 0)::numeric AS total_amount
        FROM uslugi_daily_mv AS u
        WHERE 1=1
          {filters}
        GROUP BY COALESCE(u.uslugi_type, 'Без категории')
      ),
      ranked AS (
        SELECT
          service_type,
          total_amount,
          ROW_NUMBER() OVER (ORDER BY total_amount DESC, service_type) AS row_number,
          COUNT(*) OVER () AS total_items,
          COALESCE(SUM(total_amount) OVER (), 0)::numeric AS overall_amount
        FROM aggregated
      ),
      limited AS (
        SELECT
          service_type,
          total_amount,
          total_items,
          overall_amount,
          FALSE AS is_summary,
          row_number AS sort_order
        FROM ranked
        WHERE row_number > %(offset)s
          AND row_number <= %(offset)s + %(limit)s
      ),
      summary AS (
        SELECT
          NULL::text AS service_type,
          NULL::numeric AS total_amount,
          COALESCE(MAX(total_items), 0)::int AS total_items,
          COALESCE(MAX(overall_amount), 0)::numeric AS overall_amount,
          TRUE AS is_summary,
          (%(offset)s + %(limit)s + 1) AS sort_order
        FROM ranked
      ),
      combined AS (
        SELECT * FROM limited
        UNION ALL
        SELECT * FROM summary
      )
      SELECT
        service_type,
        total_amount,
        total_items,
        overall_amount,
        is_summary
      FROM combined
      ORDER BY sort_order
    """
    ).format(filters=filters)

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
                "total_amount": _as_float(row.get("total_amount")),
            }
        )

    total_items = int(summary_row.get("total_items", 0)) if summary_row else 0
    total_amount = _as_float(summary_row.get("overall_amount")) if summary_row else 0.0

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


@app.get("/api/metrics/monthly", response_model=MonthlyMetricsResponse)
async def metrics_monthly(
    _: str = Depends(require_admin_auth),
    metric: MonthlyMetric = Query(...),
    range_: MonthlyRange = Query(default=MonthlyRange.this_year, alias="range"),
    date_field: DateField = Query(default=DateField.created),
) -> MonthlyMetricsResponse:
    start_month, end_month = _month_range(range_)
    end_date = _last_day_of_month(end_month)

    resolution = _resolve_date_field(date_field)
    filters, params = _build_filters(
        resolution,
        date_from=start_month,
        date_to=end_date,
        table_alias="g",
    )
    services_filters, services_params = _build_filters(
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

    query = sql.SQL(
        """
      WITH months AS (
        SELECT generate_series(%(series_start)s::date, %(series_end)s::date, interval '1 month')::date AS month_start
      ),
      guests_base AS (
        SELECT
          DATE_TRUNC('month', g.{date_column})::date AS month_start,
          g.total_amount,
          g.loyalty_level,
          g.created_at,
          g.checkin_date,
          g.bonus_spent
        FROM guests AS g
        WHERE 1=1
          {filters}
      ),
      guests_agg AS (
        SELECT
          month_start,
          COUNT(*)::int AS bookings_count,
          COALESCE(SUM(total_amount), 0)::numeric AS revenue,
          COALESCE(MIN(total_amount), 0)::numeric AS min_booking,
          COALESCE(MAX(total_amount), 0)::numeric AS max_booking,
          COALESCE(AVG(total_amount), 0)::numeric AS avg_check,
          COALESCE(SUM(CASE WHEN loyalty_level IN ('2 СЕЗОНА','3 СЕЗОНА','4 СЕЗОНА') THEN 1 ELSE 0 END), 0)::int AS lvl2p,
          COALESCE(AVG((created_at::date - checkin_date)::numeric), 0)::numeric AS avg_stay_days,
          COALESCE(SUM(bonus_spent), 0)::numeric AS bonus_spent_sum
        FROM guests_base
        GROUP BY month_start
      ),
      services_agg AS (
        SELECT
          DATE_TRUNC('month', u.consumption_date)::date AS month_start,
          COALESCE(SUM(u.total_amount), 0)::numeric AS services_amount
        FROM uslugi_daily_mv AS u
        WHERE 1=1
          {services_filters}
        GROUP BY DATE_TRUNC('month', u.consumption_date)
      )
      SELECT
        m.month_start,
        COALESCE(g.bookings_count, 0)::int AS bookings_count,
        COALESCE(g.revenue, 0)::numeric AS revenue,
        COALESCE(g.min_booking, 0)::numeric AS min_booking,
        COALESCE(g.max_booking, 0)::numeric AS max_booking,
        COALESCE(g.avg_check, 0)::numeric AS avg_check,
        COALESCE(g.lvl2p, 0)::int AS lvl2p,
        COALESCE(g.avg_stay_days, 0)::numeric AS avg_stay_days,
        COALESCE(g.bonus_spent_sum, 0)::numeric AS bonus_spent_sum,
        COALESCE(s.services_amount, 0)::numeric AS services_amount
      FROM months AS m
      LEFT JOIN guests_agg AS g ON g.month_start = m.month_start
      LEFT JOIN services_agg AS s ON s.month_start = m.month_start
      ORDER BY m.month_start
    """
    ).format(
        date_column=sql.Identifier(resolution.column),
        filters=filters,
        services_filters=services_filters,
    )

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

        revenue = _as_float(row.get("revenue"))
        bookings_count = int(row.get("bookings_count", 0) or 0)
        lvl2p = int(row.get("lvl2p", 0) or 0)
        bonus_spent_sum = _as_float(row.get("bonus_spent_sum"))
        services_amount = _as_float(row.get("services_amount"))
        avg_stay_days_value = _as_float(row.get("avg_stay_days"))

        revenue_sum += revenue
        bookings_sum += bookings_count
        if bookings_count > 0:
            bookings_with_data += bookings_count
            revenue_with_bookings_sum += revenue
            lvl2p_sum += lvl2p
            avg_stay_weighted_sum += avg_stay_days_value * bookings_count
            avg_stay_weight += bookings_count

            min_candidate = _as_float(row.get("min_booking"))
            max_candidate = _as_float(row.get("max_booking"))

            if min_candidate is not None:
                if min_booking_value is None:
                    min_booking_value = min_candidate
                else:
                    min_booking_value = min(min_booking_value, min_candidate)

            if max_candidate is not None:
                if max_booking_value is None:
                    max_booking_value = max_candidate
                else:
                    max_booking_value = max(max_booking_value, max_candidate)

        if revenue > 0:
            bonus_spent_sum_total += bonus_spent_sum
            bonus_revenue_total += revenue
            services_amount_total += services_amount
            services_revenue_total += revenue

        if metric is MonthlyMetric.revenue:
            value = revenue
        elif metric is MonthlyMetric.avg_check:
            value = _as_float(row.get("avg_check"))
        elif metric is MonthlyMetric.bookings_count:
            value = float(bookings_count)
        elif metric is MonthlyMetric.level2plus_share:
            value = float(lvl2p / bookings_count) if bookings_count else 0.0
        elif metric is MonthlyMetric.min_booking:
            value = _as_float(row.get("min_booking")) if bookings_count else 0.0
        elif metric is MonthlyMetric.max_booking:
            value = _as_float(row.get("max_booking")) if bookings_count else 0.0
        elif metric is MonthlyMetric.avg_stay_days:
            value = _as_float(row.get("avg_stay_days"))
        elif metric is MonthlyMetric.bonus_payment_share:
            value = float(bonus_spent_sum / revenue) if revenue else 0.0
        elif metric is MonthlyMetric.services_share:
            value = float(services_amount / revenue) if revenue else 0.0
        else:
            value = 0.0

        points.append(
            MonthlyMetricPoint(
                month=month_start,
                value=value,
            )
        )

    aggregate_value: Optional[float]

    if metric is MonthlyMetric.revenue:
        aggregate_value = revenue_sum
    elif metric is MonthlyMetric.bookings_count:
        aggregate_value = float(bookings_sum)
    elif metric is MonthlyMetric.avg_check:
        if bookings_with_data > 0:
            aggregate_value = revenue_with_bookings_sum / bookings_with_data
        else:
            aggregate_value = 0.0 if points else None
    elif metric is MonthlyMetric.level2plus_share:
        if bookings_with_data > 0:
            aggregate_value = float(lvl2p_sum / bookings_with_data)
        else:
            aggregate_value = 0.0 if points else None
    elif metric is MonthlyMetric.min_booking:
        aggregate_value = _as_float(min_booking_value) if min_booking_value is not None else (0.0 if points else None)
    elif metric is MonthlyMetric.max_booking:
        aggregate_value = _as_float(max_booking_value) if max_booking_value is not None else (0.0 if points else None)
    elif metric is MonthlyMetric.avg_stay_days:
        if avg_stay_weight > 0:
            aggregate_value = avg_stay_weighted_sum / avg_stay_weight
        else:
            aggregate_value = 0.0 if points else None
    elif metric is MonthlyMetric.bonus_payment_share:
        if bonus_revenue_total > 0:
            aggregate_value = float(bonus_spent_sum_total / bonus_revenue_total)
        else:
            aggregate_value = 0.0 if points else None
    elif metric is MonthlyMetric.services_share:
        if services_revenue_total > 0:
            aggregate_value = float(services_amount_total / services_revenue_total)
        else:
            aggregate_value = 0.0 if points else None
    else:
        aggregate_value = None

    return MonthlyMetricsResponse(
        metric=metric,
        range=range_,
        date_field=resolution.column,
        points=points,
        aggregate=aggregate_value,
    )


@app.get("/api/services/monthly", response_model=MonthlyServiceResponse)
async def services_monthly(
    _: str = Depends(require_admin_auth),
    service_type: str = Query(..., min_length=1),
    range_: MonthlyRange = Query(default=MonthlyRange.this_year, alias="range"),
) -> MonthlyServiceResponse:
    normalized_service = service_type.strip()
    if not normalized_service:
        raise HTTPException(status_code=422, detail="service_type must be provided")

    start_month, end_month = _month_range(range_)
    end_date = _last_day_of_month(end_month)

    filters, params = _build_filters(
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

    query = sql.SQL(
        """
      WITH months AS (
        SELECT generate_series(%(series_start)s::date, %(series_end)s::date, interval '1 month')::date AS month_start
      ),
      services_base AS (
        SELECT
          DATE_TRUNC('month', u.consumption_date)::date AS month_start,
          COALESCE(u.total_amount, 0)::numeric AS total_amount
        FROM uslugi_daily_mv AS u
        WHERE 1=1
          {filters}
          {service_filter}
      ),
      services_agg AS (
        SELECT
          month_start,
          COALESCE(SUM(total_amount), 0)::numeric AS total_amount
        FROM services_base
        GROUP BY month_start
      )
      SELECT
        m.month_start,
        COALESCE(s.total_amount, 0)::numeric AS total_amount
      FROM months AS m
      LEFT JOIN services_agg AS s ON s.month_start = m.month_start
      ORDER BY m.month_start
    """
    ).format(filters=filters, service_filter=service_clause)

    dsn = settings.database_url
    rows = await fetchall(dsn, query, params) or []

    points: list[MonthlyServicePoint] = []
    aggregate_value = 0.0

    for row in rows:
        month_start = row.get("month_start")
        value = _as_float(row.get("total_amount"))
        aggregate_value += value
        if isinstance(month_start, datetime):
            month_value = month_start.date()
        else:
            month_value = month_start
        points.append(MonthlyServicePoint(month=month_value, value=value))

    return MonthlyServiceResponse(
        service_type=normalized_service,
        range=range_,
        points=points,
        aggregate=aggregate_value,
    )
