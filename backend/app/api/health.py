from __future__ import annotations

from fastapi import APIRouter

from app.settings import get_settings

router = APIRouter()


@router.get("/health")
def health() -> dict[str, object]:
    settings = get_settings()
    return {"ok": True, "env": settings.app_env}


__all__ = ["router"]
