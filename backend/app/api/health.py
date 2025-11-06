from __future__ import annotations

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from app.db.health import check_database
from app.settings import get_settings

router = APIRouter()


@router.get("/health")
async def health() -> JSONResponse:
    settings = get_settings()
    db_ok, db_error = await check_database(settings.database_url)

    payload: dict[str, object] = {
        "ok": db_ok,
        "env": settings.app_env,
        "database": {"ok": db_ok},
    }

    if db_error:
        payload["database"]["error"] = db_error

    status_code = status.HTTP_200_OK if db_ok else status.HTTP_503_SERVICE_UNAVAILABLE
    return JSONResponse(status_code=status_code, content=payload)


__all__ = ["router"]
