from __future__ import annotations
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from enum import Enum
from hmac import compare_digest
from typing import Annotated, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.db import close_all_pools, get_conn
from app.settings import get_settings

settings = get_settings()
ADMIN_HASH = settings.admin_password_sha256.lower()

@asynccontextmanager
async def lifespan(_: FastAPI):
    """Manage global resources for the application lifecycle."""

    try:
        yield
    finally:
        close_all_pools()


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


class ServicesResponse(BaseModel):
    used_field: str
    used_reason: str
    date_from: Optional[date]
    date_to: Optional[date]
    total_amount: float
    items: list[ServiceItem]


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
) -> tuple[str, dict[str, datetime]]:
    clauses: list[str] = []
    params: dict[str, datetime] = {}

    prefix = f"{table_alias}." if table_alias else ""

    if date_from:
        clauses.append(f"AND {prefix}{resolution.column} >= %(from)s")
        params["from"] = datetime.combine(date_from, MIDNIGHT)

    if date_to:
        clauses.append(f"AND {prefix}{resolution.column} < %(to)s")
        params["to"] = datetime.combine(date_to + timedelta(days=1), MIDNIGHT)

    filters = "\n        ".join(clauses)
    return filters, params


def _as_float(value: object) -> float:
    return float(value if value is not None else 0)


@app.get("/api/metrics", response_model=MetricsResponse)
def metrics(
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

    sql = f"""
      WITH base AS (
        SELECT
          g.total_amount,
          g.loyalty_level,
          g.created_at,
          g.checkin_date,
          g.bonus_spent,
          COALESCE(u.services_total, 0)::numeric AS services_total
        FROM guests AS g
        LEFT JOIN (
          SELECT shelter_booking_id, COALESCE(SUM(uslugi_amount), 0)::numeric AS services_total
          FROM uslugi
          GROUP BY shelter_booking_id
        ) AS u ON u.shelter_booking_id = g.shelter_booking_id
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
        COALESCE(SUM(services_total), 0)::numeric AS services_amount
      FROM base
    """

    with get_conn(dsn) as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        row = cur.fetchone() or {}

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
def services(
    _: str = Depends(require_admin_auth),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    date_field: DateField = Query(default=DateField.created),
) -> ServicesResponse:
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=422, detail="date_from must be before or equal to date_to")

    dsn = settings.database_url
    resolution = _resolve_date_field(date_field)
    filters, params = _build_filters(resolution, date_from, date_to, table_alias="g")

    sql = f"""
      SELECT
        COALESCE(u.uslugi_type, 'Без категории') AS service_type,
        COALESCE(SUM(u.uslugi_amount), 0)::numeric AS total_amount
      FROM uslugi AS u
      JOIN guests AS g ON g.shelter_booking_id = u.shelter_booking_id
      WHERE 1=1
        {filters}
      GROUP BY COALESCE(u.uslugi_type, 'Без категории')
      ORDER BY total_amount DESC, service_type
    """

    with get_conn(dsn) as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall() or []

    raw_items = [
        {
            "service_type": str(row.get("service_type") or "Без категории"),
            "total_amount": _as_float(row.get("total_amount")),
        }
        for row in rows
    ]

    total_amount = sum(item["total_amount"] for item in raw_items)
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
    )
