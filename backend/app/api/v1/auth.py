from __future__ import annotations

import hashlib
import hmac

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.api.dependencies import SettingsDep
from app.core.security import create_access_token


class LoginRequest(BaseModel):
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest, settings: SettingsDep) -> LoginResponse:

    password = (payload.password or "").strip()
    if not password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password is required")

    candidate_hash = hashlib.sha256(password.encode("utf-8")).hexdigest()
    if not hmac.compare_digest(candidate_hash, settings.admin_password_sha256):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token, token_payload = create_access_token(
        secret=settings.auth_token_secret,
        subject="admin",
        ttl_seconds=settings.auth_token_ttl_seconds,
    )

    return LoginResponse(
        access_token=token,
        expires_in=max(0, token_payload.expires_at - token_payload.issued_at),
    )


__all__ = ["router"]

