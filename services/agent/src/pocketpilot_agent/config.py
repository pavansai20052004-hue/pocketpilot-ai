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
    session_database_path: str = ".pocketpilot/sessions.db"
    llm_provider: str = "mock"
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "qwen2.5-coder:7b"
    ollama_timeout_seconds: float = 45.0
    analysis_max_context_files: int = 6
    analysis_max_context_chars: int = 24_000
    analysis_max_lines_per_file: int = 80
    patch_max_files: int = 5
    patch_max_additions: int = 100
    patch_max_change_ratio: float = 0.6

    @property
    def allowed_desktop_origins(self) -> list[str]:
        """Return normalized CORS origins for the local dashboard."""

        return [origin.strip() for origin in self.desktop_origins.split(",") if origin.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return one immutable-by-convention settings instance per process."""

    return Settings()
