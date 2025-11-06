import hashlib
import string
from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    app_env: str = "prod"
    database_url: str  # postgresql+psycopg://user:pass@host:port/dbname
    admin_password_sha256: str  # hex string
    cors_allow_origins: str = ""  # comma-separated list of origins
    port: int = 8000
    read_only: bool = False

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

@lru_cache
def get_settings() -> "Settings":
    return Settings()
