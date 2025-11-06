from __future__ import annotations

from contextlib import asynccontextmanager
import re

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import api_router
from app.db import close_all_pools
from app.settings import get_settings


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
    settings = get_settings()

    raw_origins = [o.strip() for o in settings.cors_allow_origins.split(",") if o.strip()]

    allow_all_origins = not raw_origins or any(origin == "*" for origin in raw_origins)
    allow_origin_regex = None
    configured_origins: list[str] = []

    if allow_all_origins:
        configured_origins = ["*"]
    else:
        wildcard_patterns = []
        for origin in raw_origins:
            if "*" in origin:
                wildcard_patterns.append(_cors_pattern_to_regex(origin))
            else:
                configured_origins.append(origin)

        if wildcard_patterns:
            allow_origin_regex = "|".join(wildcard_patterns)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=configured_origins,
        allow_origin_regex=allow_origin_regex,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
        allow_credentials=False,
    )


def _cors_pattern_to_regex(pattern: str) -> str:
    escaped = re.escape(pattern)
    return "^" + escaped.replace("\\*", "[^/]*") + "$"


app = create_app()


__all__ = ["app", "create_app"]
