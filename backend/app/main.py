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

    raw_origins = [
        origin.strip().rstrip("/")
        for origin in settings.cors_allow_origins.split(",")
        if origin.strip()
    ]

    allow_all_origins = "*" in raw_origins or not raw_origins
    explicit_origins: list[str] = []
    wildcard_patterns: list[str] = []

    if not allow_all_origins:
        for origin in raw_origins:
            if "*" in origin:
                wildcard_patterns.append(_cors_pattern_to_regex(origin))
            else:
                explicit_origins.append(origin)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if allow_all_origins else explicit_origins,
        allow_origin_regex="|".join(wildcard_patterns) if wildcard_patterns else None,
        allow_methods=["*"],
        allow_headers=["*"],
        allow_credentials=False,
    )


def _cors_pattern_to_regex(pattern: str) -> str:
    escaped = re.escape(pattern)
    # Разрешаем любое количество уровней поддоменов, если шаблон содержит "*."
    # (например, https://*.example.com должно охватывать example.com и foo.bar.example.com)
    escaped = re.sub(r"\\\*\\.", r"(?:[^/.]+\\.)*", escaped)
    return "^" + escaped.replace("\\*", "[^/]*") + "$"


app = create_app()


__all__ = ["app", "create_app"]
