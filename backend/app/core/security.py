"""Минималистичная реализация токенов доступа без внешних зависимостей."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from dataclasses import dataclass


def _b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


class TokenError(ValueError):
    """Общее исключение для ошибок валидации токена."""


@dataclass(frozen=True)
class TokenPayload:
    subject: str
    issued_at: int
    expires_at: int


def create_access_token(*, secret: str, subject: str, ttl_seconds: int) -> tuple[str, TokenPayload]:
    issued_at = int(time.time())
    expires_at = issued_at + max(0, int(ttl_seconds))
    payload = {"sub": subject, "iat": issued_at, "exp": expires_at}
    payload_bytes = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    signature = hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).digest()
    token = f"{_b64encode(payload_bytes)}.{_b64encode(signature)}"
    return token, TokenPayload(subject=subject, issued_at=issued_at, expires_at=expires_at)


def verify_access_token(*, token: str, secret: str) -> TokenPayload:
    try:
        payload_part, signature_part = token.split(".", maxsplit=1)
    except ValueError as exc:  # pragma: no cover - защита от некорректных данных
        raise TokenError("Некорректный формат токена") from exc

    try:
        payload_bytes = _b64decode(payload_part)
        signature = _b64decode(signature_part)
    except Exception as exc:  # pragma: no cover - защита от некорректных данных
        raise TokenError("Не удалось декодировать токен") from exc

    expected_signature = hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).digest()
    if not hmac.compare_digest(signature, expected_signature):
        raise TokenError("Подпись токена недействительна")

    try:
        payload_dict = json.loads(payload_bytes)
    except json.JSONDecodeError as exc:  # pragma: no cover - защита от некорректных данных
        raise TokenError("Некорректное содержимое токена") from exc

    subject = payload_dict.get("sub")
    issued_at = int(payload_dict.get("iat", 0))
    expires_at = int(payload_dict.get("exp", 0))

    if not subject:
        raise TokenError("Токен не содержит идентификатор субъекта")

    now = int(time.time())
    if expires_at and now >= expires_at:
        raise TokenError("Срок действия токена истёк")

    return TokenPayload(subject=subject, issued_at=issued_at, expires_at=expires_at)


__all__ = [
    "TokenError",
    "TokenPayload",
    "create_access_token",
    "verify_access_token",
]

