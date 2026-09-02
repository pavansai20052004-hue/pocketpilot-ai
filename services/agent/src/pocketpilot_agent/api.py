"""Versioned repository-inspection and command-runner API."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status

from pocketpilot_agent.commands import CommandNotAllowedError
from pocketpilot_agent.models import (
    CommandRun,
    InspectWorkspaceRequest,
    RepositoryFileIndex,
    SafeCommandList,
    WorkspaceInfo,
)
from pocketpilot_agent.security import (
    WorkspaceNotFoundError,
    WorkspaceSecurityError,
)
from pocketpilot_agent.workspace import (
    CommandRunNotFoundError,
    NoWorkspaceSelectedError,
    WorkspaceService,
)

router = APIRouter(prefix="/api/v1")


def get_workspace_service(request: Request) -> WorkspaceService:
    return request.app.state.workspace_service


WorkspaceDependency = Annotated[WorkspaceService, Depends(get_workspace_service)]


@router.post("/workspaces/inspect", response_model=WorkspaceInfo, tags=["workspaces"])
def inspect_workspace(
    payload: InspectWorkspaceRequest,
    service: WorkspaceDependency,
) -> WorkspaceInfo:
    try:
        return service.inspect(payload.root_path)
    except (WorkspaceNotFoundError, WorkspaceSecurityError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from None


@router.get("/workspaces/current", response_model=WorkspaceInfo, tags=["workspaces"])
def current_workspace(service: WorkspaceDependency) -> WorkspaceInfo:
    try:
        return service.current()
    except NoWorkspaceSelectedError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from None


@router.get(
    "/workspaces/current/files",
    response_model=RepositoryFileIndex,
    tags=["workspaces"],
)
def current_workspace_files(service: WorkspaceDependency) -> RepositoryFileIndex:
    try:
        return service.files()
    except NoWorkspaceSelectedError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from None


@router.get(
    "/workspaces/current/commands",
    response_model=SafeCommandList,
    tags=["commands"],
)
def current_workspace_commands(service: WorkspaceDependency) -> SafeCommandList:
    try:
        return service.commands()
    except NoWorkspaceSelectedError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from None


@router.post(
    "/commands/{command_id}/run",
    response_model=CommandRun,
    tags=["commands"],
)
def run_command(command_id: str, service: WorkspaceDependency) -> CommandRun:
    try:
        return service.run_command(command_id)
    except NoWorkspaceSelectedError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from None
    except (CommandNotAllowedError, WorkspaceSecurityError, WorkspaceNotFoundError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from None


@router.get(
    "/commands/runs/{run_id}",
    response_model=CommandRun,
    tags=["commands"],
)
def get_command_run(run_id: str, service: WorkspaceDependency) -> CommandRun:
    try:
        return service.command_run(run_id)
    except CommandRunNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from None
