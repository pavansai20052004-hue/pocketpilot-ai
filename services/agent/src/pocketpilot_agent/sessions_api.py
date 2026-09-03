"""Versioned debug-session HTTP and WebSocket API."""

import asyncio
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

from pocketpilot_agent.device_auth import (
    authenticate_websocket,
    bearer_token,
    is_trusted_local_client,
)
from pocketpilot_agent.device_registry import (
    DeviceAuthenticationError,
    DeviceRevokedError,
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
from pocketpilot_agent.patch_store import PatchNotFoundError
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
        local_client = is_trusted_local_client(websocket.client)
        token = bearer_token(websocket.headers.get("authorization"))
        if not local_client and not token:
            authentication = await asyncio.wait_for(websocket.receive_json(), timeout=5)
            if (
                isinstance(authentication, dict)
                and authentication.get("type") == "authenticate"
                and isinstance(authentication.get("token"), str)
            ):
                token = authentication["token"]
        authenticate_websocket(websocket, websocket.app.state.device_registry, token)
    except WebSocketDisconnect:
        return
    except (TimeoutError, ValueError):
        await websocket.close(code=4401, reason="Device authentication is required.")
        return
    except DeviceRevokedError:
        await websocket.close(code=4403, reason="This device has been revoked.")
        return
    except DeviceAuthenticationError:
        await websocket.close(code=4401, reason="Device authentication is required.")
        return
    try:
        service.get(session_id)
    except SessionNotFoundError:
        await websocket.close(code=4404, reason="Debug session was not found.")
        return

    last_sent = max(0, after_sequence)
    async with broker.subscribe(session_id) as queue:
        snapshot = service.events(session_id, last_sent)
        patch = None
        patch_service = getattr(websocket.app.state, "patch_service", None)
        if patch_service is not None:
            try:
                patch = patch_service.get(session_id).model_dump(mode="json")
            except PatchNotFoundError:
                patch = None
        await websocket.send_json(
            {
                "type": "snapshot",
                "session": service.get(session_id).model_dump(mode="json"),
                "events": [event.model_dump(mode="json") for event in snapshot.events],
                "patch": patch,
            }
        )
        if snapshot.events:
            last_sent = snapshot.events[-1].sequence
        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=5)
                except TimeoutError:
                    if token:
                        try:
                            websocket.app.state.device_registry.authenticate(token)
                        except DeviceRevokedError:
                            await websocket.close(
                                code=4403, reason="This device has been revoked."
                            )
                            return
                        except DeviceAuthenticationError:
                            await websocket.close(
                                code=4401, reason="Device authentication expired."
                            )
                            return
                    continue
                if token:
                    try:
                        websocket.app.state.device_registry.authenticate(token)
                    except DeviceRevokedError:
                        await websocket.close(code=4403, reason="This device has been revoked.")
                        return
                    except DeviceAuthenticationError:
                        await websocket.close(code=4401, reason="Device authentication expired.")
                        return
                if event.sequence <= last_sent:
                    continue
                await websocket.send_json(
                    {"type": "event", "event": event.model_dump(mode="json")}
                )
                last_sent = event.sequence
        except WebSocketDisconnect:
            return
