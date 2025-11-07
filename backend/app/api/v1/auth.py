from __future__ import annotations

import hashlib
import hmac
import json
from urllib.parse import parse_qs

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel

from app.settings import get_settings
from app.core.limiter import limiter
from app.core.security import create_access_token


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


router = APIRouter(prefix="/api/auth", tags=["auth"])


def _extract_password_from_mapping(payload: dict[str, object]) -> str:
    for key in ("password", "login"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _decode_bytes(data: bytes, charset: str | None = None) -> str:
    encodings = [charset, "utf-8", "latin-1"]
    for encoding in encodings:
        if not encoding:
            continue
        try:
            return data.decode(encoding)
        except (LookupError, UnicodeDecodeError):
            continue
    return data.decode("utf-8", errors="ignore")


async def _extract_password(request: Request) -> str:
    body = await request.body()
    if not body:
        return ""

    content_type = request.headers.get("content-type", "").lower()
    media_type, _, params = content_type.partition(";")
    media_type = media_type.strip()
    charset = None
    if params:
        for chunk in params.split(";"):
            name, _, value = chunk.partition("=")
            if name.strip() == "charset" and value:
                charset = value.strip().strip('"')
                break

    if "json" in media_type:
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            pass
        else:
            if isinstance(payload, str):
                return payload.strip()
            if isinstance(payload, dict):
                return _extract_password_from_mapping(payload)

    if media_type.startswith("application/x-www-form-urlencoded"):
        text = _decode_bytes(body, charset)
        form = parse_qs(text, keep_blank_values=False)
        for key in ("password", "login"):
            values = form.get(key) or []
            for value in values:
                if value.strip():
                    return value.strip()

    if media_type.startswith("multipart/form-data"):
        form = await request.form()
        for key in ("password", "login"):
            value = form.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()

    if media_type == "text/plain" or not media_type:
        text = _decode_bytes(body, charset).strip()
        if text:
            return text

    # Попробуем распарсить JSON даже при неверном заголовке Content-Type
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        text = _decode_bytes(body, charset).strip()
        return text
    else:
        if isinstance(payload, str):
            return payload.strip()
        if isinstance(payload, dict):
            return _extract_password_from_mapping(payload)
        return ""


@router.post("/login", response_model=LoginResponse)
@limiter.limit("5/minute")
async def login(request: Request) -> LoginResponse:
    settings = get_settings()
    password = await _extract_password(request)

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

