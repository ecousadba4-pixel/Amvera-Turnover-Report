from __future__ import annotations

import asyncio
from contextlib import AsyncExitStack
from pathlib import Path
from typing import Iterator

import pytest
from fastapi import Depends, FastAPI
from fastapi.dependencies.utils import get_dependant, solve_dependencies
from starlette.requests import Request

import sys

sys.path.append(str(Path(__file__).resolve().parents[2]))

from app.api.dependencies import require_admin_auth
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


def test_metrics_dependency_accepts_legacy_hash() -> None:
    asyncio.run(_run_dependency_check())


async def _run_dependency_check() -> None:
    app = FastAPI()

    @app.get("/ping")
    def ping(_: str = Depends(require_admin_auth)) -> str:
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
        "headers": [(b"x-auth-hash", ADMIN_HASH.encode("ascii"))],
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
    assert solved.values["_"].subject == "admin"
