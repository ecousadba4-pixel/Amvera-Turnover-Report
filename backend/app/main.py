from __future__ import annotations

from contextlib import asynccontextmanager
import re

from urllib.parse import urlsplit, urlunsplit

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

    def _normalize_origin(origin: str) -> str:
        cleaned = origin.strip()
        if not cleaned:
            return ""
        if cleaned == "*":
            return "*"
        if cleaned.startswith("http://") or cleaned.startswith("https://"):
            cleaned = cleaned.rstrip("/")
        return cleaned

    raw_origins = [
        normalized
        for origin in settings.cors_allow_origins.split(",")
        if (normalized := _normalize_origin(origin))
    ]

    allow_all_origins = not raw_origins or any(origin == "*" for origin in raw_origins)
    allow_origin_regex = None
    configured_origins: list[str] = []
    configured_origin_set: set[str] = set()

    def _add_configured_origin(value: str) -> None:
        if value and value not in configured_origin_set:
            configured_origin_set.add(value)
            configured_origins.append(value)

    def _maybe_www_variant(origin: str) -> str:
        try:
            parsed = urlsplit(origin)
        except ValueError:
            return ""

        if not parsed.scheme or not parsed.hostname:
            return ""

        hostname = parsed.hostname
        if hostname.startswith("www."):
            return ""

        port = f":{parsed.port}" if parsed.port else ""
        netloc = f"www.{hostname}{port}"
        return urlunsplit((parsed.scheme, netloc, "", "", ""))

    if allow_all_origins:
        configured_origins = ["*"]
    else:
        wildcard_patterns = []
        for origin in raw_origins:
            if "*" in origin:
                wildcard_patterns.append(_cors_pattern_to_regex(origin))
            else:
                _add_configured_origin(origin)
                www_variant = _maybe_www_variant(origin)
                if www_variant:
                    _add_configured_origin(www_variant)

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
    # Разрешаем опциональный поддомен, если шаблон содержит "*." (например, https://*.example.com)
    escaped = re.sub(r"\\\*\\.", r"(?:[^/.]+\\.)?", escaped)
    return "^" + escaped.replace("\\*", "[^/]*") + "$"


app = create_app()


__all__ = ["app", "create_app"]
