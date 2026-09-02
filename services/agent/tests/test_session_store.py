"""Persistent session and append-only event storage tests."""

from pathlib import Path

import pytest

from pocketpilot_agent.models import DebugState
from pocketpilot_agent.session_service import DebugSessionService
from pocketpilot_agent.session_store import (
    SessionRevisionConflictError,
    SessionStore,
)


def service(database: Path) -> DebugSessionService:
    return DebugSessionService(SessionStore(str(database)))


def test_session_and_events_survive_service_restart(tmp_path: Path) -> None:
    database = tmp_path / "sessions.db"
    first_service = service(database)
    created = first_service.create("Persistent fixture")
    transitioned = first_service.transition(
        created.session.id,
        DebugState.CAPTURED,
        expected_revision=0,
        summary="Error text captured.",
    )

    restarted = service(database)
    restored = restarted.get(created.session.id)
    event_list = restarted.events(created.session.id)

    assert restored == transitioned.session
    assert [event.sequence for event in event_list.events] == [1, 2]
    assert [event.state for event in event_list.events] == [
        DebugState.IDLE,
        DebugState.CAPTURED,
    ]


def test_stale_revision_does_not_write_event(tmp_path: Path) -> None:
    session_service = service(tmp_path / "sessions.db")
    created = session_service.create("Revision fixture")
    session_service.transition(
        created.session.id,
        DebugState.CAPTURED,
        expected_revision=0,
        summary="Captured.",
    )

    with pytest.raises(SessionRevisionConflictError):
        session_service.transition(
            created.session.id,
            DebugState.ANALYZING,
            expected_revision=0,
            summary="Stale client.",
        )

    assert len(session_service.events(created.session.id).events) == 2


def test_event_query_uses_exclusive_sequence_cursor(tmp_path: Path) -> None:
    session_service = service(tmp_path / "sessions.db")
    created = session_service.create("Cursor fixture")
    session_service.transition(
        created.session.id,
        DebugState.CAPTURED,
        expected_revision=0,
        summary="Captured.",
    )

    events = session_service.events(created.session.id, after_sequence=1)

    assert [event.sequence for event in events.events] == [2]
