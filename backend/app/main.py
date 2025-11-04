from __future__ import annotations
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from enum import Enum
from functools import cache
from hmac import compare_digest
from typing import Annotated, Optional

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.db import get_conn
from app.settings import get_settings

settings = get_settings()
ADMIN_HASH = settings.admin_password_sha256.lower()

app = FastAPI(title="U4S Revenue API", version="1.0.0")

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


AuthHeader = Annotated[Optional[str], Header(alias="X-Auth-Hash", convert_underscores=False)]


@dataclass(frozen=True)
class DateFieldResolution:
    column: str
    reason: str

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

def ensure_auth(x_auth_hash: AuthHeader) -> None:
    if not x_auth_hash:
        raise HTTPException(status_code=401, detail="Missing auth")
    normalized = x_auth_hash.strip().lower()
    if not normalized:
        raise HTTPException(status_code=401, detail="Missing auth")
    if not compare_digest(normalized, ADMIN_HASH):
        raise HTTPException(status_code=403, detail="Forbidden")

@cache
def _resolve_date_field(dsn: str, wanted: DateField) -> DateFieldResolution:
    if wanted is DateField.checkin:
        return DateFieldResolution("checkin_date", "checkin_date")
    return DateFieldResolution("created_at", "created_at")

@app.get("/health")
def health():
    return {"ok": True, "env": settings.app_env}

def _build_filters(resolution: DateFieldResolution, date_from: Optional[date], date_to: Optional[date]) -> tuple[str, dict[str, datetime]]:
    clauses: list[str] = []
    params: dict[str, datetime] = {}

    if date_from:
        clauses.append(f"AND {resolution.column} >= %(from)s")
        params["from"] = datetime.combine(date_from, MIDNIGHT)

    if date_to:
        clauses.append(f"AND {resolution.column} < %(to)s")
        params["to"] = datetime.combine(date_to + timedelta(days=1), MIDNIGHT)

    filters = "\n        ".join(clauses)
    return filters, params


def _as_float(value: object) -> float:
    return float(value if value is not None else 0)


@app.get("/api/metrics", response_model=MetricsResponse)
def metrics(
    x_auth_hash: AuthHeader = None,
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    date_field: DateField = Query(default=DateField.created),
) -> MetricsResponse:
    ensure_auth(x_auth_hash)

    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=422, detail="date_from must be before or equal to date_to")

    dsn = settings.database_url
    resolution = _resolve_date_field(dsn, date_field)
    filters, params = _build_filters(resolution, date_from, date_to)

    sql = f"""
      SELECT
        COUNT(*)::int                                   AS bookings_count,
        COALESCE(SUM(total_amount),0)::numeric          AS revenue,
        COALESCE(MIN(total_amount),0)::numeric          AS min_booking,
        COALESCE(MAX(total_amount),0)::numeric          AS max_booking,
        COALESCE(AVG(total_amount),0)::numeric          AS avg_check,
        COALESCE(SUM(CASE WHEN loyalty_level IN ('2 СЕЗОНА','3 СЕЗОНА','4 СЕЗОНА') THEN 1 ELSE 0 END),0)::int AS lvl2p
      FROM guests
      WHERE 1=1
        {filters}
    """

    with get_conn(dsn) as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        row = cur.fetchone() or {}

    count = int(row.get("bookings_count", 0))
    lvl2p = int(row.get("lvl2p", 0))
    share = float(lvl2p / count) if count else 0.0

    return MetricsResponse(
        used_field=resolution.column,
        used_reason=resolution.reason,
        date_from=date_from,
        date_to=date_to,
        revenue=_as_float(row.get("revenue")),
        avg_check=_as_float(row.get("avg_check")),
        bookings_count=count,
        level2plus_share=share,
        min_booking=_as_float(row.get("min_booking")),
        max_booking=_as_float(row.get("max_booking")),
    )
