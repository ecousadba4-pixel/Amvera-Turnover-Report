from __future__ import annotations

from fastapi import APIRouter

from app.api.health import router as health_router
from app.api.v1.metrics import router as metrics_router
from app.api.v1.services import router as services_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(metrics_router)
api_router.include_router(services_router)

__all__ = ["api_router"]
