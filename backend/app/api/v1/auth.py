from __future__ import annotations

import hashlib
import hmac

from typing import Annotated, Iterable

from fastapi import APIRouter, Body, Form, HTTPException, Request, status
from pydantic import BaseModel

from app.api.dependencies import SettingsDep
from app.core.limiter import limiter
from app.core.security import create_access_token


class LoginRequest(BaseModel):
    password: str | None = None
    login: str | None = None


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


router = APIRouter(prefix="/api/auth", tags=["auth"])


LoginPayload = Annotated[LoginRequest | str | None, Body(default=None, embed=False)]
FormField = Annotated[str | None, Form(default=None)]


def _iter_password_candidates(payload: LoginPayload, form_password: str | None, form_login: str | None) -> Iterable[str]:
    if isinstance(payload, LoginRequest):
        if payload.password is not None:
            yield payload.password
        if payload.login is not None:
            yield payload.login
    elif isinstance(payload, str):
        yield payload

    if form_password is not None:
        yield form_password
    if form_login is not None:
        yield form_login


@router.post("/login", response_model=LoginResponse)
@limiter.limit("5/minute")
async def login(
    request: Request,
    payload: LoginPayload,
    settings: SettingsDep,
    password_form: FormField = None,
    login_form: FormField = None,
) -> LoginResponse:
    password = ""
    for candidate in _iter_password_candidates(payload, password_form, login_form):
        if isinstance(candidate, str) and candidate.strip():
            password = candidate.strip()
            break

    if not password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Password is required"
        )

    candidate_hash = hashlib.sha256(password.encode("utf-8")).hexdigest()
    if not hmac.compare_digest(candidate_hash, settings.admin_password_sha256):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials"
        )

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

