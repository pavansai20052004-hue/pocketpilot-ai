"""Versioned human-approval and patch lifecycle API."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status

from pocketpilot_agent.analysis_provider import AnalysisProviderError
from pocketpilot_agent.analysis_store import AnalysisNotFoundError
from pocketpilot_agent.models import (
    GeneratePatchRequest,
    PatchActionResponse,
    PatchDecisionRequest,
    PatchGenerationResponse,
    PatchWorkflowView,
)
from pocketpilot_agent.patch_engine import (
    PatchApplyError,
    RollbackConflictError,
    StalePatchError,
)
from pocketpilot_agent.patch_service import (
    InvalidPatchProposalError,
    PatchDecisionError,
    PatchOperationConflictError,
    PatchService,
)
from pocketpilot_agent.patch_store import PatchNotFoundError
from pocketpilot_agent.security import WorkspaceSecurityError
from pocketpilot_agent.session_store import (
    SessionNotFoundError,
    SessionRevisionConflictError,
)
from pocketpilot_agent.state_machine import InvalidTransitionError
from pocketpilot_agent.workspace import NoWorkspaceSelectedError

router = APIRouter(prefix="/api/v1/sessions")


def get_patch_service(request: Request) -> PatchService:
    return request.app.state.patch_service


PatchDependency = Annotated[PatchService, Depends(get_patch_service)]


@router.post(
    "/{session_id}/patches/generate",
    response_model=PatchGenerationResponse,
    tags=["patches"],
)
async def generate_patch(
    session_id: str, payload: GeneratePatchRequest, service: PatchDependency
) -> PatchGenerationResponse:
    try:
        return await service.generate(session_id, payload.expected_revision)
    except (SessionNotFoundError, AnalysisNotFoundError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from None
    except AnalysisProviderError as exc:
        code = (
            status.HTTP_504_GATEWAY_TIMEOUT
            if exc.status.value == "TIMEOUT"
            else status.HTTP_503_SERVICE_UNAVAILABLE
        )
        raise HTTPException(
            status_code=code,
            detail={"status": exc.status, "message": str(exc)},
        ) from None
    except InvalidPatchProposalError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from None
    except (
        PatchDecisionError,
        PatchOperationConflictError,
        SessionRevisionConflictError,
        InvalidTransitionError,
        NoWorkspaceSelectedError,
        WorkspaceSecurityError,
    ) as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from None


@router.get(
    "/{session_id}/patches/current",
    response_model=PatchWorkflowView,
    tags=["patches"],
)
def current_patch(session_id: str, service: PatchDependency) -> PatchWorkflowView:
    try:
        return service.get(session_id)
    except (SessionNotFoundError, PatchNotFoundError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from None


@router.post(
    "/{session_id}/patches/{patch_id}/approve",
    response_model=PatchActionResponse,
    tags=["patches"],
)
async def approve_patch(
    session_id: str,
    patch_id: str,
    payload: PatchDecisionRequest,
    service: PatchDependency,
) -> PatchActionResponse:
    try:
        return await service.approve(session_id, patch_id, payload.expected_revision)
    except SessionNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from None
    except (
        PatchNotFoundError,
        PatchDecisionError,
        PatchOperationConflictError,
        SessionRevisionConflictError,
        InvalidTransitionError,
        StalePatchError,
        RollbackConflictError,
        NoWorkspaceSelectedError,
        WorkspaceSecurityError,
    ) as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from None
    except PatchApplyError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from None


@router.post(
    "/{session_id}/patches/{patch_id}/reject",
    response_model=PatchActionResponse,
    tags=["patches"],
)
async def reject_patch(
    session_id: str,
    patch_id: str,
    payload: PatchDecisionRequest,
    service: PatchDependency,
) -> PatchActionResponse:
    try:
        return await service.reject(session_id, patch_id, payload.expected_revision)
    except SessionNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from None
    except (
        PatchNotFoundError,
        PatchDecisionError,
        PatchOperationConflictError,
        SessionRevisionConflictError,
        InvalidTransitionError,
    ) as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from None


@router.post(
    "/{session_id}/patches/{patch_id}/rollback",
    response_model=PatchActionResponse,
    tags=["patches"],
)
async def rollback_patch(
    session_id: str,
    patch_id: str,
    payload: PatchDecisionRequest,
    service: PatchDependency,
) -> PatchActionResponse:
    try:
        return await service.rollback(session_id, patch_id, payload.expected_revision)
    except SessionNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from None
    except (
        PatchNotFoundError,
        PatchDecisionError,
        PatchOperationConflictError,
        SessionRevisionConflictError,
        InvalidTransitionError,
        RollbackConflictError,
        NoWorkspaceSelectedError,
        WorkspaceSecurityError,
    ) as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from None
    except PatchApplyError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from None
