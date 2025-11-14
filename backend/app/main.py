from __future__ import annotations

from contextlib import asynccontextmanager
import re

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import api_router
from app.core.limiter import configure_rate_limiting
from app.core.logging import configure_logging, logger
from app.db import close_all_pools
from app.settings import Settings, get_settings


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        yield
    finally:
        await close_all_pools()


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings)
    logger.bind(component="app").info("Запуск приложения", env=settings.app_env)

    application = FastAPI(title="U4S Revenue API", version="1.0.0", lifespan=lifespan)
    configure_rate_limiting(application)
    _configure_cors(application, settings)
    application.include_router(api_router)
    return application


def _configure_cors(app: FastAPI, settings: Settings | None = None) -> None:
    settings = settings or get_settings()
    allow_origins, allow_origin_regex = _parse_cors_origins(settings.cors_allow_origins)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins,
        allow_origin_regex=allow_origin_regex,
        allow_methods=["*"],
        allow_headers=["*"],
        allow_credentials=False,
    )


def _parse_cors_origins(raw_origins: str) -> tuple[list[str], str | None]:
    """Парсит строку origins и возвращает список явных origins и regex."""

    origins = [origin.strip().rstrip("/") for origin in raw_origins.split(",") if origin.strip()]

    if "*" in origins or not origins:
        return ["*"], None

    explicit = [origin for origin in origins if "*" not in origin]
    wildcards = [_cors_pattern_to_regex(origin) for origin in origins if "*" in origin]

    return explicit, "|".join(wildcards) if wildcards else None


def _cors_pattern_to_regex(pattern: str) -> str:
    escaped = re.escape(pattern)
    # Разрешаем любое количество уровней поддоменов, если шаблон содержит "*."
    # (например, https://*.example.com должно охватывать example.com и foo.bar.example.com)
    escaped = re.sub(r"\\\*\\.", r"(?:[^/.]+\\.)*", escaped)
    return "^" + escaped.replace("\\*", "[^/]*") + "$"


app = create_app()


__all__ = ["app", "create_app"]
