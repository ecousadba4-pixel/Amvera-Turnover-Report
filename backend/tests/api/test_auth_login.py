from __future__ import annotations

import asyncio
import hashlib
from pathlib import Path
from typing import Iterator

import pytest
from fastapi import HTTPException
from starlette.requests import Request

import sys

sys.path.append(str(Path(__file__).resolve().parents[2]))

from app.api.v1.auth import LoginRequest, login
from app.settings import get_settings

ADMIN_PASSWORD = "topsecret"
ADMIN_HASH = hashlib.sha256(ADMIN_PASSWORD.encode("utf-8")).hexdigest()


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


def _make_request() -> Request:
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/auth/login",
        "headers": [],
        "query_string": b"",
        "client": ("127.0.0.1", 0),
        "app": None,
    }
    request = Request(scope)
    request.scope["endpoint"] = login
    return request


def test_login_requires_password_field() -> None:
    settings = get_settings()
    request = _make_request()
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(login(request, LoginRequest(), settings))
    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Password is required"


def test_login_accepts_login_field_alias() -> None:
    settings = get_settings()
    request = _make_request()
    response = asyncio.run(login(request, LoginRequest(login=ADMIN_PASSWORD), settings))
    assert response.token_type == "bearer"
    assert isinstance(response.access_token, str)
    assert response.access_token


def test_login_accepts_raw_string_payload() -> None:
    settings = get_settings()
    request = _make_request()
    response = asyncio.run(login(request, ADMIN_PASSWORD, settings))
    assert response.token_type == "bearer"
    assert isinstance(response.access_token, str)
    assert response.access_token


def test_login_accepts_form_password() -> None:
    settings = get_settings()
    request = _make_request()
    response = asyncio.run(
        login(request, None, settings, password_form=f"  {ADMIN_PASSWORD}  ")
    )
    assert response.token_type == "bearer"
    assert isinstance(response.access_token, str)
    assert response.access_token
