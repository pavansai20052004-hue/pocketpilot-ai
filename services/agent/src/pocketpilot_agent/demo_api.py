"""Safe demo-mode API accepting registered IDs, never filesystem paths."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status

from pocketpilot_agent.demo_service import DemoResetError, DemoService, UnknownDemoError
from pocketpilot_agent.models import (
    DemoProject,
    DemoProjectList,
    DemoResetAllResult,
    DemoResetResult,
    DemoSelection,
    PreDemoCheckResult,
)

router = APIRouter(prefix="/api/v1/demo", tags=["demo"])


def get_demo_service(request: Request) -> DemoService:
    return request.app.state.demo_service


DemoDependency = Annotated[DemoService, Depends(get_demo_service)]


@router.get("/projects", response_model=DemoProjectList)
def list_demos(service: DemoDependency) -> DemoProjectList:
    return DemoProjectList(demos=service.list())


@router.post("/select/{demo_id}", response_model=DemoSelection)
def select_demo(demo_id: str, service: DemoDependency) -> DemoSelection:
    try:
        return service.select(demo_id)
    except UnknownDemoError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from None


@router.post("/reset/{demo_id}", response_model=DemoResetResult)
def reset_demo(demo_id: str, service: DemoDependency) -> DemoResetResult:
    try:
        return service.reset(demo_id)
    except UnknownDemoError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from None
    except DemoResetError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from None


@router.post("/reset", response_model=DemoResetAllResult)
def reset_all_demos(service: DemoDependency) -> DemoResetAllResult:
    try:
        return service.reset_all()
    except DemoResetError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from None


@router.post("/verify/{demo_id}", response_model=DemoProject)
def verify_demo(demo_id: str, service: DemoDependency) -> DemoProject:
    try:
        return service.check(demo_id)
    except UnknownDemoError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from None


@router.get("/preflight", response_model=PreDemoCheckResult)
async def preflight(service: DemoDependency) -> PreDemoCheckResult:
    return await service.preflight()
