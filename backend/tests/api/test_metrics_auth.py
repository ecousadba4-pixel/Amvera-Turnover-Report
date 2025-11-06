from __future__ import annotations

import asyncio
from contextlib import AsyncExitStack
from pathlib import Path
from typing import Iterator

import pytest
from fastapi import Depends, FastAPI, HTTPException
from fastapi.dependencies.utils import get_dependant, solve_dependencies
from starlette.requests import Request

import sys

sys.path.append(str(Path(__file__).resolve().parents[2]))

from app.api.dependencies import require_admin_auth
from app.core.security import TokenPayload, create_access_token
from app.settings import get_settings

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


def test_metrics_dependency_requires_bearer_token() -> None:
    payload = asyncio.run(_run_dependency_check())
    assert payload.subject == "admin"
    assert payload.expires_at > payload.issued_at


def test_metrics_dependency_rejects_missing_auth() -> None:
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(_run_dependency_check_missing_auth())
    assert exc_info.value.status_code == 401


async def _run_dependency_check() -> TokenPayload:
    app = FastAPI()
    settings = get_settings()
    token, _ = create_access_token(
        secret=settings.auth_token_secret,
        subject="admin",
        ttl_seconds=settings.auth_token_ttl_seconds,
    )

    @app.get("/ping")
    def ping(_: TokenPayload = Depends(require_admin_auth)) -> str:
        return "pong"

    route = next(
        route
        for route in app.routes
        if getattr(route, "path", None) == "/ping" and hasattr(route, "endpoint")
    )
    dependant = get_dependant(path=route.path, call=route.endpoint, name=route.name)

    scope = {
        "type": "http",
        "method": "GET",
        "path": "/ping",
        "headers": [(b"authorization", f"Bearer {token}".encode("ascii"))],
        "query_string": b"",
        "app": app,
    }
    request = Request(scope)

    async with AsyncExitStack() as exit_stack:
        inner_stack = AsyncExitStack()
        function_stack = AsyncExitStack()
        await exit_stack.enter_async_context(inner_stack)
        await exit_stack.enter_async_context(function_stack)
        request.scope["fastapi_inner_astack"] = inner_stack
        request.scope["fastapi_function_astack"] = function_stack
        solved = await solve_dependencies(
            request=request,
            dependant=dependant,
            dependency_overrides_provider=app,
            async_exit_stack=exit_stack,
            embed_body_fields=False,
        )

    assert not solved.errors
    assert "_" in solved.values
    return solved.values["_"]


async def _run_dependency_check_missing_auth() -> TokenPayload:
    app = FastAPI()

    @app.get("/ping")
    def ping(_: TokenPayload = Depends(require_admin_auth)) -> str:
        return "pong"

    route = next(
        route
        for route in app.routes
        if getattr(route, "path", None) == "/ping" and hasattr(route, "endpoint")
    )
    dependant = get_dependant(path=route.path, call=route.endpoint, name=route.name)

    scope = {
        "type": "http",
        "method": "GET",
        "path": "/ping",
        "headers": [],
        "query_string": b"",
        "app": app,
    }
    request = Request(scope)

    async with AsyncExitStack() as exit_stack:
        inner_stack = AsyncExitStack()
        function_stack = AsyncExitStack()
        await exit_stack.enter_async_context(inner_stack)
        await exit_stack.enter_async_context(function_stack)
        request.scope["fastapi_inner_astack"] = inner_stack
        request.scope["fastapi_function_astack"] = function_stack
        solved = await solve_dependencies(
            request=request,
            dependant=dependant,
            dependency_overrides_provider=app,
            async_exit_stack=exit_stack,
            embed_body_fields=False,
        )

    if solved.errors:
        raise solved.errors[0]
    return solved.values["_"]
