from __future__ import annotations

import asyncio
import hashlib
import json
from pathlib import Path

import pytest
from fastapi import HTTPException
from starlette.requests import Request

import sys

sys.path.append(str(Path(__file__).resolve().parents[2]))

from app.api.v1.auth import login
from app.settings import get_settings

ADMIN_PASSWORD = "topsecret"
ADMIN_HASH = hashlib.sha256(ADMIN_PASSWORD.encode("utf-8")).hexdigest()


@pytest.fixture(autouse=True)
def _configure_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://user:pass@localhost:5432/db")
    monkeypatch.setenv("ADMIN_PASSWORD_SHA256", ADMIN_HASH)
    monkeypatch.setenv("CORS_ALLOW_ORIGINS", "*")
    monkeypatch.setenv("AUTH_TOKEN_TTL_SECONDS", "3600")
    get_settings.cache_clear()
    try:
        yield
    finally:
        get_settings.cache_clear()


def _make_request(
    body: bytes = b"",
    *,
    content_type: str | None = None,
) -> Request:
    headers = []
    if content_type:
        headers.append((b"content-type", content_type.encode("latin-1")))

    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/auth/login",
        "headers": headers,
        "query_string": b"",
        "client": ("127.0.0.1", 0),
        "app": None,
    }

    body_sent = False

    async def receive() -> dict[str, object]:
        nonlocal body_sent
        if body_sent:
            return {"type": "http.request", "body": b"", "more_body": False}
        body_sent = True
        return {"type": "http.request", "body": body, "more_body": False}

    request = Request(scope, receive)
    request.scope["endpoint"] = login
    return request


def test_login_requires_password_field() -> None:
    settings = get_settings()
    request = _make_request(b"{}", content_type="application/json")
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(login(request, settings))
    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Password is required"


def test_login_accepts_login_field_alias() -> None:
    settings = get_settings()
    payload = json.dumps({"login": ADMIN_PASSWORD}).encode("utf-8")
    request = _make_request(payload, content_type="application/json")
    response = asyncio.run(login(request, settings))
    assert response.token_type == "bearer"
    assert isinstance(response.access_token, str)
    assert response.access_token


def test_login_accepts_raw_string_payload() -> None:
    settings = get_settings()
    request = _make_request(ADMIN_PASSWORD.encode("utf-8"), content_type="text/plain")
    response = asyncio.run(login(request, settings))
    assert response.token_type == "bearer"
    assert isinstance(response.access_token, str)
    assert response.access_token


def test_login_accepts_form_password() -> None:
    settings = get_settings()
    data = "password=" + ADMIN_PASSWORD
    request = _make_request(data.encode("utf-8"), content_type="application/x-www-form-urlencoded")
    response = asyncio.run(login(request, settings))
    assert response.token_type == "bearer"
    assert isinstance(response.access_token, str)
    assert response.access_token


def test_login_rejects_invalid_password() -> None:
    settings = get_settings()
    payload = json.dumps({"password": "wrong"}).encode("utf-8")
    request = _make_request(payload, content_type="application/json")
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(login(request, settings))
    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Invalid credentials"
