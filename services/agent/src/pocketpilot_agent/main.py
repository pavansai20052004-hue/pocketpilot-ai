"""PocketPilot FastAPI application factory and routes."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from pocketpilot_agent import __version__
from pocketpilot_agent.api import router as api_router
from pocketpilot_agent.config import Settings, get_settings
from pocketpilot_agent.schemas import ComponentStatus, HealthResponse, SystemStatus
from pocketpilot_agent.workspace import WorkspaceService


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build the local agent API without performing privileged startup work."""

    active_settings = settings or get_settings()
    application = FastAPI(
        title="PocketPilot Local Agent",
        summary="Local-first control plane for the PocketPilot phone client.",
        version=__version__,
        docs_url="/docs",
        redoc_url=None,
    )
    workspace_service = WorkspaceService(active_settings)
    application.state.workspace_service = workspace_service
    application.add_middleware(
        CORSMiddleware,
        allow_origins=active_settings.allowed_desktop_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )
    application.include_router(api_router)

    @application.get("/health", response_model=HealthResponse, tags=["system"])
    async def health() -> HealthResponse:
        return HealthResponse(status="ok", service="PocketPilot Agent", version=__version__)

    @application.get("/api/v1/system/status", response_model=SystemStatus, tags=["system"])
    async def system_status() -> SystemStatus:
        return SystemStatus(
            service="PocketPilot Agent",
            version=__version__,
            environment=active_settings.environment,
            components=ComponentStatus(
                api="ready",
                workspace="ready" if workspace_service.has_current else "not_configured",
                model="not_configured",
            ),
        )

    return application


app = create_app()
