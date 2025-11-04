from __future__ import annotations
from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, Literal
from hmac import compare_digest
from datetime import datetime, date, timedelta
from app.settings import get_settings
from app.db import get_conn, column_exists

settings = get_settings()

app = FastAPI(title="U4S Revenue API", version="1.0.0")

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

def ensure_auth(x_auth_hash: Optional[str]):
    if not x_auth_hash:
        raise HTTPException(status_code=401, detail="Missing auth")
    if not compare_digest(x_auth_hash.lower(), settings.admin_password_sha256.lower()):
        raise HTTPException(status_code=403, detail="Forbidden")

def _resolve_date_field(dsn: str, wanted: Literal["checkout","created","checkin"]) -> tuple[str,str]:
    if wanted == "checkout":
        if column_exists(dsn, "guests", "checkout_date"):
            return "checkout_date", "checkout_date"
        return "created_at", "fallback_created_at"
    if wanted == "checkin":
        return "checkin_date", "checkin_date"
    return "created_at", "created_at"

@app.get("/health")
def health():
    return {"ok": True, "env": settings.app_env}

@app.get("/api/metrics")
def metrics(
    x_auth_hash: Optional[str] = Header(default=None, convert_underscores=False),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    date_field: Literal["checkout","created","checkin"] = Query(default="checkout"),
):
    ensure_auth(x_auth_hash)
    dsn = settings.database_url
    used_field, reason = _resolve_date_field(dsn, date_field)

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
        { 'AND ' + used_field + ' >= %(from)s' if date_from else '' }
        { 'AND ' + used_field + ' <  %(to)s'   if date_to   else '' }
    """

    params = {}
    if date_from:
        params['from'] = datetime.combine(date_from, datetime.min.time())
    if date_to:
        # half-open [from, to): add one day to include 'date_to'
        params['to'] = datetime.combine(date_to, datetime.min.time()) + timedelta(days=1)

    with get_conn(dsn) as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        row = cur.fetchone()

    count = int(row['bookings_count'])
    lvl2p = int(row['lvl2p'])
    share = (lvl2p / count) if count else 0.0

    return {
        'used_field': used_field,
        'used_reason': reason,
        'date_from': date_from.isoformat() if date_from else None,
        'date_to': date_to.isoformat() if date_to else None,
        'revenue': float(row['revenue']),
        'avg_check': float(row['avg_check']),
        'bookings_count': count,
        'level2plus_share': share,
        'min_booking': float(row['min_booking']),
        'max_booking': float(row['max_booking']),
    }
