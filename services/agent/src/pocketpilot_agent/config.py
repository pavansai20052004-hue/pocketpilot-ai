"""Environment-backed service configuration."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Validated, namespaced process settings."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="POCKETPILOT_",
        extra="ignore",
    )

    agent_host: str = "127.0.0.1"
    agent_port: int = 8000
    log_level: str = "info"
    environment: str = "development"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return one immutable-by-convention settings instance per process."""

    return Settings()
