"""Transactional debug-session orchestration."""

import threading
import uuid
from datetime import UTC, datetime

from pocketpilot_agent.models import (
    AgentEvent,
    AgentEventName,
    DebugSession,
    DebugState,
    SessionEventList,
    SessionTransitionResult,
)
from pocketpilot_agent.session_store import (
    SessionRevisionConflictError,
    SessionStore,
)
from pocketpilot_agent.state_machine import DebugStateMachine


class DebugSessionService:
    """Apply validated transitions and persist their matching events atomically."""

    def __init__(self, store: SessionStore) -> None:
        self.store = store
        self.machine = DebugStateMachine()
        self._lock = threading.RLock()

    def create(self, title: str) -> SessionTransitionResult:
        now = datetime.now(UTC)
        session_id = str(uuid.uuid4())
        event = AgentEvent(
            id=str(uuid.uuid4()),
            session_id=session_id,
            sequence=1,
            name=AgentEventName.SESSION_STARTED,
            state=DebugState.IDLE,
            summary="Debug session started.",
            occurred_at=now,
        )
        session = DebugSession(
            id=session_id,
            title=title.strip(),
            state=DebugState.IDLE,
            revision=0,
            retry_count=0,
            created_at=now,
            updated_at=now,
            last_event_sequence=1,
        )
        self.store.create(session, event)
        return SessionTransitionResult(session=session, event=event)

    def transition(
        self,
        session_id: str,
        target_state: DebugState,
        expected_revision: int,
        summary: str,
    ) -> SessionTransitionResult:
        with self._lock:
            current = self.store.get(session_id)
            if current.revision != expected_revision:
                raise SessionRevisionConflictError(
                    "Session changed since the client snapshot; refresh and retry."
                )
            decision = self.machine.decide(
                current.state, target_state, current.retry_count
            )
            now = datetime.now(UTC)
            sequence = current.last_event_sequence + 1
            updated = current.model_copy(
                update={
                    "state": target_state,
                    "revision": current.revision + 1,
                    "retry_count": decision.retry_count,
                    "updated_at": now,
                    "last_event_sequence": sequence,
                }
            )
            event = AgentEvent(
                id=str(uuid.uuid4()),
                session_id=session_id,
                sequence=sequence,
                name=decision.event_name,
                state=target_state,
                summary=summary.strip(),
                occurred_at=now,
            )
            self.store.persist_transition(current, updated, event)
            return SessionTransitionResult(session=updated, event=event)

    def get(self, session_id: str) -> DebugSession:
        return self.store.get(session_id)

    def append_event(
        self,
        session_id: str,
        name: AgentEventName,
        summary: str,
    ) -> SessionTransitionResult:
        """Persist one analysis progress event without bypassing session ownership."""

        with self._lock:
            current = self.store.get(session_id)
            now = datetime.now(UTC)
            updated = current.model_copy(
                update={
                    "updated_at": now,
                    "last_event_sequence": current.last_event_sequence + 1,
                }
            )
            event = AgentEvent(
                id=str(uuid.uuid4()),
                session_id=session_id,
                sequence=updated.last_event_sequence,
                name=name,
                state=current.state,
                summary=summary.strip(),
                occurred_at=now,
            )
            self.store.append_event(current, updated, event)
            return SessionTransitionResult(session=updated, event=event)

    def list(self, limit: int) -> list[DebugSession]:
        return self.store.list(limit)

    def events(self, session_id: str, after_sequence: int = 0) -> SessionEventList:
        session = self.store.get(session_id)
        return SessionEventList(
            session_id=session_id,
            current_state=session.state,
            current_revision=session.revision,
            events=self.store.events(session_id, after_sequence),
        )
