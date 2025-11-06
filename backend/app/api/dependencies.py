from __future__ import annotations

from functools import lru_cache
from typing import Annotated, AsyncIterator, Optional

from fastapi import Depends, Header, HTTPException, status

from app.core.security import TokenPayload
from app.services.auth import AdminAuthError, AdminTokenService
from app.settings import Settings, get_settings
from app.db import use_database

SettingsDep = Annotated[Settings, Depends(get_settings)]


def get_database_dsn(settings: SettingsDep) -> str:
    return settings.database_url


DatabaseDsn = Annotated[str, Depends(get_database_dsn)]


async def _use_database(dsn: DatabaseDsn) -> AsyncIterator[None]:
    async with use_database(dsn):
        yield


DatabaseSession = Annotated[None, Depends(_use_database)]

AuthHeader = Annotated[
    Optional[str], Header(alias="Authorization", convert_underscores=False)
]


@lru_cache
def _get_admin_token_service() -> AdminTokenService:
    settings = get_settings()
    return AdminTokenService(
        secret=settings.auth_token_secret,
        ttl_seconds=settings.auth_token_ttl_seconds,
    )


def require_admin_auth(authorization: AuthHeader = None) -> TokenPayload:
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization header",
        )

    service = _get_admin_token_service()
    try:
        return service.verify_bearer(authorization)
    except AdminAuthError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc


__all__ = [
    "SettingsDep",
    "get_database_dsn",
    "DatabaseDsn",
    "DatabaseSession",
    "AuthHeader",
    "require_admin_auth",
]
