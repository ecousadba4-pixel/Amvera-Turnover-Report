from __future__ import annotations

import sys
from pathlib import Path
from typing import Iterator

import asyncio
import json

import pytest
from fastapi import Request

sys.path.append(str(Path(__file__).resolve().parents[2]))

from app.api.health import health
from app.api.v1.auth import login
from app.core.limiter import limiter
from app.settings import get_settings
from slowapi.errors import RateLimitExceeded

ADMIN_HASH = "a" * 64


@pytest.fixture(autouse=True)
def _configure_settings(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://user:pass@localhost:5432/db")
    monkeypatch.setenv("ADMIN_PASSWORD_SHA256", ADMIN_HASH)
    monkeypatch.setenv("CORS_ALLOW_ORIGINS", "*")
    monkeypatch.setenv("AUTH_TOKEN_TTL_SECONDS", "3600")
    get_settings.cache_clear()
    try:
        yield
    finally:
        get_settings.cache_clear()


@pytest.fixture(autouse=True)
def _reset_rate_limits() -> Iterator[None]:
    limiter.reset()
    try:
        yield
    finally:
        limiter.reset()


def test_health_includes_pool_status(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_check_pool(_dsn: str) -> tuple[bool, str | None]:
        return True, None

    async def fake_check_database(_dsn: str) -> tuple[bool, str | None]:
        return True, None

    monkeypatch.setattr("app.api.health.check_pool_ready", fake_check_pool)
    monkeypatch.setattr("app.api.health.check_database", fake_check_database)

    settings = get_settings()
    response = asyncio.run(health(settings=settings, dsn=settings.database_url))

    assert response.status_code == 200
    payload = json.loads(response.body.decode())
    assert payload == {
        "ok": True,
        "env": settings.app_env,
        "database": {"ok": True},
        "pool": {"ok": True},
    }


def test_health_reports_pool_and_database_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_check_pool(_dsn: str) -> tuple[bool, str | None]:
        return False, "pool down"

    async def fake_check_database(_dsn: str) -> tuple[bool, str | None]:
        return False, "db down"

    monkeypatch.setattr("app.api.health.check_pool_ready", fake_check_pool)
    monkeypatch.setattr("app.api.health.check_database", fake_check_database)

    settings = get_settings()
    response = asyncio.run(health(settings=settings, dsn=settings.database_url))

    assert response.status_code == 503
    payload = json.loads(response.body.decode())
    assert payload["ok"] is False
    assert payload["pool"] == {"ok": False, "error": "pool down"}
    assert payload["database"] == {"ok": False, "error": "db down"}


def test_login_rate_limiting() -> None:
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/auth/login",
        "headers": [],
        "query_string": b"",
        "client": ("127.0.0.1", 12345),
        "app": None,
    }
    request = Request(scope)
    request.scope["endpoint"] = login

    for _ in range(5):
        asyncio.run(limiter.check_request(request))

    with pytest.raises(RateLimitExceeded):
        asyncio.run(limiter.check_request(request))
