import hashlib
import string
from functools import lru_cache
from typing import Optional

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    app_env: str = "prod"
    database_url: str  # postgresql+psycopg://user:pass@host:port/dbname
    admin_password_sha256: str  # hex string
    cors_allow_origins: str = ""  # comma-separated list of origins
    auth_token_secret: Optional[str] = None
    auth_token_ttl_seconds: int = 3600
    port: int = 8000
    log_level: str = "INFO"
    log_json: bool = False

    model_config = SettingsConfigDict(
        env_prefix="",
        env_file=".env",
        case_sensitive=False,
    )

    @field_validator("admin_password_sha256", mode="before")
    @classmethod
    def _normalize_admin_hash(cls, value: str) -> str:
        if not isinstance(value, str):
            raise ValueError("ADMIN_PASSWORD_SHA256 must be a string")

        cleaned = value.strip()
        if not cleaned:
            raise ValueError("ADMIN_PASSWORD_SHA256 must not be empty")

        if len(cleaned) == 64 and all(ch in string.hexdigits for ch in cleaned):
            return cleaned.lower()

        # treat non-hex values as plain-text passwords and hash them automatically
        return hashlib.sha256(cleaned.encode("utf-8")).hexdigest()

    @field_validator("auth_token_secret", mode="before")
    @classmethod
    def _ensure_auth_secret(cls, value: Optional[str], info):
        if value and isinstance(value, str) and value.strip():
            return value.strip()

        admin_hash = info.data.get("admin_password_sha256")
        if not admin_hash:
            raise ValueError("AUTH_TOKEN_SECRET requires admin password hash")

        seed = f"{admin_hash}:token-secret".encode("utf-8")
        return hashlib.sha256(seed).hexdigest()

    @field_validator("log_level", mode="before")
    @classmethod
    def _normalize_log_level(cls, value: Optional[str]) -> str:
        if not value:
            return "INFO"

        if isinstance(value, str):
            cleaned = value.strip().upper()
            return cleaned or "INFO"

        raise ValueError("LOG_LEVEL must be a string")

@lru_cache
def get_settings() -> "Settings":
    return Settings()
