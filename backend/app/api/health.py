from __future__ import annotations

from typing import Any

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from app.api.dependencies import DatabaseDsn, SettingsDep
from app.db import check_pool_ready
from app.db.health import check_database

router = APIRouter()


@router.get("/health")
async def health(settings: SettingsDep, dsn: DatabaseDsn) -> JSONResponse:
    pool_ok, pool_error = await check_pool_ready(dsn)
    db_ok, db_error = await check_database(dsn)

    overall_ok = pool_ok and db_ok

    payload: dict[str, Any] = {
        "ok": overall_ok,
        "env": settings.app_env,
        "database": {"ok": db_ok},
        "pool": {"ok": pool_ok},
    }

    if db_error:
        payload["database"]["error"] = db_error

    if pool_error:
        payload["pool"]["error"] = pool_error

    status_code = (
        status.HTTP_200_OK if overall_ok else status.HTTP_503_SERVICE_UNAVAILABLE
    )
    return JSONResponse(status_code=status_code, content=payload)


__all__ = ["router"]
