from __future__ import annotations

from typing import Annotated, Optional

from fastapi import Header, HTTPException, status

from app.core.security import TokenError, TokenPayload, verify_access_token
from app.settings import get_settings

settings = get_settings()

AuthHeader = Annotated[Optional[str], Header(alias="Authorization", convert_underscores=False)]


def require_admin_auth(authorization: AuthHeader) -> TokenPayload:
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
