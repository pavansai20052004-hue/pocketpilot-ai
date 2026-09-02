"""Versioned endpoints for local root-cause analysis."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status

from pocketpilot_agent.analysis_provider import AnalysisProviderError
from pocketpilot_agent.analysis_service import (
    AnalysisInProgressError,
    AnalysisService,
    UnsupportedAnalysisInputError,
)
from pocketpilot_agent.analysis_store import AnalysisNotFoundError
from pocketpilot_agent.models import (
    AnalysisExecutionResponse,
    AnalysisRecord,
    AnalysisStatus,
    AnalyzeSessionRequest,
    ProviderHealth,
)
from pocketpilot_agent.session_store import (
    SessionNotFoundError,
    SessionRevisionConflictError,
)
from pocketpilot_agent.state_machine import InvalidTransitionError, RetryLimitExceededError
from pocketpilot_agent.workspace import NoWorkspaceSelectedError

router = APIRouter(prefix="/api/v1")


def get_analysis_service(request: Request) -> AnalysisService:
    return request.app.state.analysis_service


AnalysisDependency = Annotated[AnalysisService, Depends(get_analysis_service)]


@router.get("/analysis/provider", response_model=ProviderHealth, tags=["analysis"])
async def provider_health(service: AnalysisDependency) -> ProviderHealth:
    return await service.health()


@router.post(
    "/sessions/{session_id}/analyze",
    response_model=AnalysisExecutionResponse,
    tags=["analysis"],
)
async def analyze_session(
    session_id: str,
    payload: AnalyzeSessionRequest,
    service: AnalysisDependency,
) -> AnalysisExecutionResponse:
    try:
        return await service.analyze(session_id, payload)
    except SessionNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from None
    except NoWorkspaceSelectedError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from None
    except UnsupportedAnalysisInputError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from None
    except (
        AnalysisInProgressError,
        SessionRevisionConflictError,
        InvalidTransitionError,
        RetryLimitExceededError,
    ) as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from None
    except AnalysisProviderError as exc:
        status_code = {
            AnalysisStatus.TIMEOUT: status.HTTP_504_GATEWAY_TIMEOUT,
            AnalysisStatus.INVALID_RESPONSE: status.HTTP_422_UNPROCESSABLE_CONTENT,
            AnalysisStatus.MODEL_NOT_FOUND: status.HTTP_503_SERVICE_UNAVAILABLE,
            AnalysisStatus.PROVIDER_UNAVAILABLE: status.HTTP_503_SERVICE_UNAVAILABLE,
        }.get(exc.status, status.HTTP_503_SERVICE_UNAVAILABLE)
        raise HTTPException(
            status_code=status_code,
            detail={"status": exc.status, "message": str(exc)},
        ) from None


@router.get(
    "/sessions/{session_id}/analysis",
    response_model=AnalysisRecord,
    tags=["analysis"],
)
def get_analysis(session_id: str, service: AnalysisDependency) -> AnalysisRecord:
    try:
        service.sessions.get(session_id)
        return service.store.get(session_id)
    except SessionNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from None
    except AnalysisNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from None
