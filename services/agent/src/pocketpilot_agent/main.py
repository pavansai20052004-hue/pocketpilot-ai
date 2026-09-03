"""PocketPilot FastAPI application factory and routes."""

from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.responses import Response

from pocketpilot_agent import __version__
from pocketpilot_agent.analysis_api import router as analysis_router
from pocketpilot_agent.analysis_provider import build_provider
from pocketpilot_agent.analysis_service import AnalysisService
from pocketpilot_agent.analysis_store import AnalysisStore
from pocketpilot_agent.api import router as api_router
from pocketpilot_agent.config import Settings, get_settings
from pocketpilot_agent.device_auth import bearer_token, is_trusted_local_client
from pocketpilot_agent.device_registry import (
    DeviceAuthenticationError,
    DeviceRegistry,
    DeviceRevokedError,
)
from pocketpilot_agent.devices_api import router as devices_router
from pocketpilot_agent.event_broker import SessionEventBroker
from pocketpilot_agent.patch_api import router as patch_router
from pocketpilot_agent.patch_provider import MockPatchProvider, OllamaPatchProvider
from pocketpilot_agent.patch_service import PatchService
from pocketpilot_agent.patch_store import PatchStore
from pocketpilot_agent.patch_validation import PatchValidator
from pocketpilot_agent.repository_context import RepositoryContextService
from pocketpilot_agent.schemas import ComponentStatus, HealthResponse, SystemStatus
from pocketpilot_agent.session_service import DebugSessionService
from pocketpilot_agent.session_store import SessionStore
from pocketpilot_agent.sessions_api import router as sessions_router
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
    application.state.settings = active_settings
    application.state.workspace_service = workspace_service
    application.state.device_registry = DeviceRegistry(
        active_settings.session_database_path,
        pairing_ttl_seconds=active_settings.pairing_code_ttl_seconds,
        pairing_max_attempts=active_settings.pairing_max_attempts,
        token_ttl_seconds=active_settings.device_token_ttl_seconds,
    )
    session_service = DebugSessionService(SessionStore(active_settings.session_database_path))
    application.state.debug_session_service = session_service
    application.state.session_event_broker = SessionEventBroker()
    provider = build_provider(
        active_settings.llm_provider,
        active_settings.ollama_base_url,
        active_settings.ollama_model,
        active_settings.ollama_timeout_seconds,
    )
    application.state.analysis_service = AnalysisService(
        sessions=session_service,
        events=application.state.session_event_broker,
        context=RepositoryContextService(
            workspace_service,
            max_files=active_settings.analysis_max_context_files,
            max_chars=active_settings.analysis_max_context_chars,
            max_lines_per_file=active_settings.analysis_max_lines_per_file,
        ),
        provider=provider,
        store=AnalysisStore(active_settings.session_database_path),
        timeout_seconds=active_settings.ollama_timeout_seconds,
    )
    patch_provider = (
        MockPatchProvider()
        if active_settings.llm_provider == "mock"
        else OllamaPatchProvider(provider)
    )
    application.state.patch_service = PatchService(
        sessions=session_service,
        events=application.state.session_event_broker,
        workspace=workspace_service,
        analyses=application.state.analysis_service.store,
        store=PatchStore(active_settings.session_database_path),
        provider=patch_provider,
        validator=PatchValidator(
            max_files=active_settings.patch_max_files,
            max_additions=active_settings.patch_max_additions,
            max_change_ratio=active_settings.patch_max_change_ratio,
        ),
        timeout_seconds=active_settings.ollama_timeout_seconds,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=active_settings.allowed_desktop_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @application.middleware("http")
    async def require_lan_device_auth(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        path = request.url.path
        protected = path.startswith("/api/v1/") and not path.startswith(
            "/api/v1/devices"
        ) and path != "/api/v1/system/status"
        if (
            request.method != "OPTIONS"
            and protected
            and not is_trusted_local_client(request.client)
        ):
            token = bearer_token(request.headers.get("authorization"))
            try:
                request.state.device = application.state.device_registry.authenticate(token)
            except DeviceRevokedError as exc:
                return JSONResponse(
                    status_code=status.HTTP_403_FORBIDDEN,
                    content={"detail": str(exc)},
                )
            except DeviceAuthenticationError as exc:
                return JSONResponse(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    content={"detail": str(exc)},
                    headers={"WWW-Authenticate": "Bearer"},
                )
        return await call_next(request)

    application.include_router(api_router)
    application.include_router(sessions_router)
    application.include_router(analysis_router)
    application.include_router(patch_router)
    application.include_router(devices_router)

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
                model="ready" if active_settings.llm_provider == "mock" else "not_configured",
            ),
        )

    return application


app = create_app()
