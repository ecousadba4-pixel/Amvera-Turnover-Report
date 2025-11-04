from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    app_env: str = "prod"
    database_url: str  # postgresql+psycopg://user:pass@host:port/dbname
    admin_password_sha256: str  # hex string
    cors_allow_origins: str = ""  # comma-separated list of origins
    port: int = 8000
    read_only: bool = False

    class Config:
        env_prefix = ""
        env_file = ".env"
        case_sensitive = False

def get_settings() -> "Settings":
    return Settings()
