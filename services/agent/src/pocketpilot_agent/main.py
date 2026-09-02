"""PocketPilot FastAPI application factory and routes."""

from fastapi import FastAPI

from pocketpilot_agent import __version__
from pocketpilot_agent.config import get_settings
from pocketpilot_agent.schemas import ComponentStatus, HealthResponse, SystemStatus


def create_app() -> FastAPI:
    """Build the local agent API without performing privileged startup work."""

    settings = get_settings()
    application = FastAPI(
        title="PocketPilot Local Agent",
        summary="Local-first control plane for the PocketPilot phone client.",
        version=__version__,
        docs_url="/docs",
        redoc_url=None,
    )

    @application.get("/health", response_model=HealthResponse, tags=["system"])
    async def health() -> HealthResponse:
        return HealthResponse(status="ok", service="PocketPilot Agent", version=__version__)

    @application.get("/api/v1/system/status", response_model=SystemStatus, tags=["system"])
    async def system_status() -> SystemStatus:
        return SystemStatus(
            service="PocketPilot Agent",
            version=__version__,
            environment=settings.environment,
            components=ComponentStatus(
                api="ready",
                workspace="not_configured",
                model="not_configured",
            ),
        )

    return application


app = create_app()
