from __future__ import annotations

import hmac
import time
import warnings
from dataclasses import dataclass
from typing import Optional

from app.core.security import TokenError, TokenPayload, verify_access_token


class AdminAuthError(Exception):
    """Базовое исключение для ошибок проверки административного доступа."""


@dataclass
class AdminTokenService:
    """Централизованный сервис для проверки и выпуска административных токенов."""

    secret: str
    ttl_seconds: int
    legacy_hash: Optional[str] = None

    def verify_bearer(self, authorization_header: str) -> TokenPayload:
        scheme, _, token = authorization_header.partition(" ")
        token_value = token.strip()
        if scheme.lower() != "bearer" or not token_value:
            raise AdminAuthError("Invalid authorization scheme")

        try:
            return verify_access_token(token=token_value, secret=self.secret)
        except TokenError as exc:  # pragma: no cover - делегируем детализацию ошибок
            raise AdminAuthError(str(exc)) from exc

    def verify_legacy_hash(self, legacy_header: Optional[str]) -> TokenPayload:
        if not legacy_header:
            raise AdminAuthError("Legacy authentication header is missing")

        candidate = legacy_header.strip().lower()
        if not candidate:
            raise AdminAuthError("Legacy authentication header is missing")

        if not self.legacy_hash:
            raise AdminAuthError("Legacy authentication is disabled")

        if not hmac.compare_digest(candidate, self.legacy_hash):
            raise AdminAuthError("Invalid credentials")

        now = int(time.time())
        ttl = max(1, int(self.ttl_seconds or 0))
        expires_at = now + ttl

        warnings.warn(
            "X-Auth-Hash authentication is deprecated and will be removed in a future release.",
            DeprecationWarning,
            stacklevel=2,
        )

        return TokenPayload(subject="admin", issued_at=now, expires_at=expires_at)


__all__ = ["AdminAuthError", "AdminTokenService"]
