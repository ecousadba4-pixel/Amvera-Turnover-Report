from __future__ import annotations

from hmac import compare_digest
from typing import Annotated, Optional

from fastapi import Header, HTTPException

from app.settings import get_settings

settings = get_settings()
ADMIN_HASH = settings.admin_password_sha256.lower()

AuthHeader = Annotated[Optional[str], Header(alias="X-Auth-Hash", convert_underscores=False)]


def require_admin_auth(x_auth_hash: AuthHeader) -> str:
    if not x_auth_hash:
        raise HTTPException(status_code=401, detail="Missing auth")

    normalized = x_auth_hash.strip().lower()
    if not normalized:
        raise HTTPException(status_code=401, detail="Missing auth")

    if not compare_digest(normalized, ADMIN_HASH):
        raise HTTPException(status_code=403, detail="Forbidden")

    return normalized


__all__ = [
    "ADMIN_HASH",
    "AuthHeader",
    "require_admin_auth",
]
