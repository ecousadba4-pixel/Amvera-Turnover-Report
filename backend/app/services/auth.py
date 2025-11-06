from __future__ import annotations

from dataclasses import dataclass

from app.core.security import TokenError, TokenPayload, verify_access_token


class AdminAuthError(Exception):
    """Базовое исключение для ошибок проверки административного доступа."""


@dataclass(slots=True)
class AdminTokenService:
    """Централизованный сервис для проверки и выпуска административных токенов."""

    secret: str
    ttl_seconds: int

    def verify_bearer(self, authorization_header: str) -> TokenPayload:
        scheme, _, token = authorization_header.partition(" ")
        token_value = token.strip()
        if scheme.lower() != "bearer" or not token_value:
            raise AdminAuthError("Invalid authorization scheme")

        try:
            return verify_access_token(token=token_value, secret=self.secret)
        except TokenError as exc:
            raise AdminAuthError(str(exc)) from exc


__all__ = ["AdminAuthError", "AdminTokenService"]
