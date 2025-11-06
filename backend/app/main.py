from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import api_router
from app.db import close_all_pools
from app.settings import get_settings

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        yield
    finally:
        await close_all_pools()


def create_app() -> FastAPI:
    application = FastAPI(title="U4S Revenue API", version="1.0.0", lifespan=lifespan)
    _configure_cors(application)
    application.include_router(api_router)
    return application


def _configure_cors(app: FastAPI) -> None:
    origins = [o.strip() for o in settings.cors_allow_origins.split(",") if o.strip()]
    if origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_methods=["GET", "POST", "OPTIONS"],
            allow_headers=["*"],
            allow_credentials=False,
        )


app = create_app()


__all__ = ["app", "create_app"]
