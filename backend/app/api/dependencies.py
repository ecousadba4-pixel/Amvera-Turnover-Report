from __future__ import annotations

import hmac
import time
from typing import Annotated, Optional

from fastapi import Header, HTTPException, status

from app.core.security import TokenError, TokenPayload, verify_access_token
from app.settings import get_settings

AuthHeader = Annotated[Optional[str], Header(alias="Authorization", convert_underscores=False)]
LegacyHashHeader = Annotated[
    Optional[str], Header(alias="X-Auth-Hash", convert_underscores=False)
]


def require_admin_auth(
    authorization: AuthHeader, legacy_auth_hash: LegacyHashHeader = None
) -> TokenPayload:
    settings = get_settings()

    if legacy_auth_hash:
        candidate = legacy_auth_hash.strip().lower()
        if candidate and hmac.compare_digest(candidate, settings.admin_password_sha256):
            now = int(time.time())
            return TokenPayload(subject="admin", issued_at=now, expires_at=0)

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing authorization header")

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authorization scheme")

    try:
        return verify_access_token(token=token.strip(), secret=settings.auth_token_secret)
    except TokenError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc


__all__ = [
    "AuthHeader",
    "require_admin_auth",
]
