from __future__ import annotations

from functools import lru_cache
from typing import Annotated, Optional

from fastapi import Depends, Header, HTTPException, status

from app.core.security import TokenPayload
from app.services.auth import AdminAuthError, AdminTokenService
from app.settings import get_settings

AuthHeader = Annotated[
    Optional[str], Header(alias="Authorization", convert_underscores=False)
]
LegacyHashHeader = Annotated[
    Optional[str], Header(alias="X-Auth-Hash", convert_underscores=False)
]


@lru_cache
def _get_admin_token_service() -> AdminTokenService:
    settings = get_settings()
    return AdminTokenService(
        secret=settings.auth_token_secret,
        ttl_seconds=settings.auth_token_ttl_seconds,
        legacy_hash=settings.admin_password_sha256,
    )


def _optional_legacy_admin_auth(
    legacy_auth_hash: LegacyHashHeader = None,
) -> Optional[TokenPayload]:
    """Путь совместимости для устаревшего заголовка ``X-Auth-Hash``.

    TODO: удалить после полной миграции на Bearer-токены.
    """

    if not legacy_auth_hash:
        return None

    service = _get_admin_token_service()
    try:
        return service.verify_legacy_hash(legacy_auth_hash)
    except AdminAuthError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc


LegacyToken = Annotated[Optional[TokenPayload], Depends(_optional_legacy_admin_auth)]


def require_admin_auth(
    authorization: AuthHeader = None,
    legacy_payload: LegacyToken = None,
) -> TokenPayload:
    if legacy_payload is not None:
        return legacy_payload

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
    "AuthHeader",
    "require_admin_auth",
]
