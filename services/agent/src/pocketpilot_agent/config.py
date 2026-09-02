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
    max_files: int = 20_000
    max_file_size: int = 1_048_576
    max_repository_scan_size: int = 104_857_600
    command_timeout_seconds: float = 120.0
    max_command_output_bytes: int = 1_048_576
    desktop_origins: str = "http://127.0.0.1:4173,http://localhost:4173"

    @property
    def allowed_desktop_origins(self) -> list[str]:
        """Return normalized CORS origins for the local dashboard."""

        return [origin.strip() for origin in self.desktop_origins.split(",") if origin.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return one immutable-by-convention settings instance per process."""

    return Settings()
