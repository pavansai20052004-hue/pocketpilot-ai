"""Versioned debug-session HTTP and WebSocket API."""

from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Request,
    WebSocket,
    WebSocketDisconnect,
    status,
)

from pocketpilot_agent.event_broker import SessionEventBroker
from pocketpilot_agent.models import (
    CreateDebugSessionRequest,
    DebugSession,
    SessionEventList,
    SessionList,
    SessionTransitionResult,
    TransitionDebugSessionRequest,
)
from pocketpilot_agent.session_service import DebugSessionService
from pocketpilot_agent.session_store import (
    SessionNotFoundError,
    SessionRevisionConflictError,
)
from pocketpilot_agent.state_machine import (
    InvalidTransitionError,
    RetryLimitExceededError,
)

router = APIRouter(prefix="/api/v1/sessions")


def get_session_service(request: Request) -> DebugSessionService:
    return request.app.state.debug_session_service


def get_event_broker(request: Request) -> SessionEventBroker:
    return request.app.state.session_event_broker


SessionDependency = Annotated[DebugSessionService, Depends(get_session_service)]
BrokerDependency = Annotated[SessionEventBroker, Depends(get_event_broker)]


@router.post("", response_model=SessionTransitionResult, tags=["sessions"])
async def create_session(
    payload: CreateDebugSessionRequest,
    service: SessionDependency,
    broker: BrokerDependency,
) -> SessionTransitionResult:
    result = service.create(payload.title)
    await broker.publish(result.event)
    return result


@router.get("", response_model=SessionList, tags=["sessions"])
def list_sessions(
    service: SessionDependency,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> SessionList:
    return SessionList(sessions=service.list(limit))


@router.get("/{session_id}", response_model=DebugSession, tags=["sessions"])
def get_session(session_id: str, service: SessionDependency) -> DebugSession:
    try:
        return service.get(session_id)
    except SessionNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from None


@router.get(
    "/{session_id}/events",
    response_model=SessionEventList,
    tags=["sessions"],
)
def get_session_events(
    session_id: str,
    service: SessionDependency,
    after_sequence: Annotated[int, Query(ge=0)] = 0,
) -> SessionEventList:
    try:
        return service.events(session_id, after_sequence)
    except SessionNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from None


@router.post(
    "/{session_id}/transitions",
    response_model=SessionTransitionResult,
    tags=["sessions"],
)
async def transition_session(
    session_id: str,
    payload: TransitionDebugSessionRequest,
    service: SessionDependency,
    broker: BrokerDependency,
) -> SessionTransitionResult:
    try:
        result = service.transition(
            session_id,
            payload.target_state,
            payload.expected_revision,
            payload.summary,
        )
    except SessionNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from None
    except (
        InvalidTransitionError,
        RetryLimitExceededError,
        SessionRevisionConflictError,
    ) as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from None
    await broker.publish(result.event)
    return result


@router.websocket("/{session_id}/events/ws")
async def stream_session_events(
    websocket: WebSocket,
    session_id: str,
    after_sequence: int = 0,
) -> None:
    service: DebugSessionService = websocket.app.state.debug_session_service
    broker: SessionEventBroker = websocket.app.state.session_event_broker
    await websocket.accept()
    try:
        service.get(session_id)
    except SessionNotFoundError:
        await websocket.close(code=4404, reason="Debug session was not found.")
        return

    last_sent = max(0, after_sequence)
    async with broker.subscribe(session_id) as queue:
        snapshot = service.events(session_id, last_sent)
        await websocket.send_json(
            {
                "type": "snapshot",
                "session": service.get(session_id).model_dump(mode="json"),
                "events": [event.model_dump(mode="json") for event in snapshot.events],
            }
        )
        if snapshot.events:
            last_sent = snapshot.events[-1].sequence
        try:
            while True:
                event = await queue.get()
                if event.sequence <= last_sent:
                    continue
                await websocket.send_json(
                    {"type": "event", "event": event.model_dump(mode="json")}
                )
                last_sent = event.sequence
        except WebSocketDisconnect:
            return
