"""SQLite persistence for debug sessions and append-only structured events."""

from __future__ import annotations

import sqlite3
from datetime import UTC, datetime
from pathlib import Path

from pocketpilot_agent.models import AgentEvent, AgentEventName, DebugSession, DebugState


class SessionNotFoundError(LookupError):
    """Raised when a session identifier is unknown."""


class SessionRevisionConflictError(ValueError):
    """Raised when a client attempts a stale transition."""


class SessionStore:
    """Small local SQLite store with transactional session/event updates."""

    def __init__(self, database_path: str) -> None:
        self.database_path = Path(database_path).resolve()
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def create(self, session: DebugSession, event: AgentEvent) -> None:
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                """
                INSERT INTO debug_sessions
                    (id, title, state, revision, retry_count, created_at, updated_at,
                     last_event_sequence)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                self._session_values(session),
            )
            self._insert_event(connection, event)

    def get(self, session_id: str) -> DebugSession:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM debug_sessions WHERE id = ?", (session_id,)
            ).fetchone()
        if row is None:
            raise SessionNotFoundError("Debug session was not found.")
        return self._session_from_row(row)

    def list(self, limit: int) -> list[DebugSession]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM debug_sessions ORDER BY updated_at DESC LIMIT ?", (limit,)
            ).fetchall()
        return [self._session_from_row(row) for row in rows]

    def events(self, session_id: str, after_sequence: int = 0) -> list[AgentEvent]:
        self.get(session_id)
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT * FROM agent_events
                WHERE session_id = ? AND sequence > ?
                ORDER BY sequence ASC
                """,
                (session_id, after_sequence),
            ).fetchall()
        return [self._event_from_row(row) for row in rows]

    def persist_transition(
        self,
        previous: DebugSession,
        updated: DebugSession,
        event: AgentEvent,
    ) -> None:
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            result = connection.execute(
                """
                UPDATE debug_sessions
                SET state = ?, revision = ?, retry_count = ?, updated_at = ?,
                    last_event_sequence = ?
                WHERE id = ? AND revision = ?
                """,
                (
                    updated.state,
                    updated.revision,
                    updated.retry_count,
                    updated.updated_at.isoformat(),
                    updated.last_event_sequence,
                    updated.id,
                    previous.revision,
                ),
            )
            if result.rowcount != 1:
                raise SessionRevisionConflictError(
                    "Session changed since the client snapshot; refresh and retry."
                )
            self._insert_event(connection, event)

    def append_event(
        self,
        previous: DebugSession,
        updated: DebugSession,
        event: AgentEvent,
    ) -> None:
        """Append progress without changing the workflow revision or state."""

        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            result = connection.execute(
                """UPDATE debug_sessions
                SET updated_at = ?, last_event_sequence = ?
                WHERE id = ? AND revision = ? AND last_event_sequence = ?""",
                (
                    updated.updated_at.isoformat(),
                    updated.last_event_sequence,
                    updated.id,
                    previous.revision,
                    previous.last_event_sequence,
                ),
            )
            if result.rowcount != 1:
                raise SessionRevisionConflictError(
                    "Session changed while an analysis event was being recorded."
                )
            self._insert_event(connection, event)

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS debug_sessions (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    state TEXT NOT NULL,
                    revision INTEGER NOT NULL,
                    retry_count INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    last_event_sequence INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS agent_events (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    sequence INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    state TEXT NOT NULL,
                    summary TEXT NOT NULL,
                    occurred_at TEXT NOT NULL,
                    FOREIGN KEY (session_id) REFERENCES debug_sessions(id) ON DELETE CASCADE,
                    UNIQUE (session_id, sequence)
                );
                CREATE INDEX IF NOT EXISTS idx_agent_events_session_sequence
                    ON agent_events(session_id, sequence);
                """
            )

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path, timeout=5)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    @staticmethod
    def _session_values(session: DebugSession) -> tuple[object, ...]:
        return (
            session.id,
            session.title,
            session.state,
            session.revision,
            session.retry_count,
            session.created_at.isoformat(),
            session.updated_at.isoformat(),
            session.last_event_sequence,
        )

    @staticmethod
    def _insert_event(connection: sqlite3.Connection, event: AgentEvent) -> None:
        connection.execute(
            """
            INSERT INTO agent_events
                (id, session_id, sequence, name, state, summary, occurred_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event.id,
                event.session_id,
                event.sequence,
                event.name,
                event.state,
                event.summary,
                event.occurred_at.isoformat(),
            ),
        )

    @staticmethod
    def _session_from_row(row: sqlite3.Row) -> DebugSession:
        return DebugSession(
            id=row["id"],
            title=row["title"],
            state=DebugState(row["state"]),
            revision=row["revision"],
            retry_count=row["retry_count"],
            created_at=datetime.fromisoformat(row["created_at"]).astimezone(UTC),
            updated_at=datetime.fromisoformat(row["updated_at"]).astimezone(UTC),
            last_event_sequence=row["last_event_sequence"],
        )

    @staticmethod
    def _event_from_row(row: sqlite3.Row) -> AgentEvent:
        return AgentEvent(
            id=row["id"],
            session_id=row["session_id"],
            sequence=row["sequence"],
            name=AgentEventName(row["name"]),
            state=DebugState(row["state"]),
            summary=row["summary"],
            occurred_at=datetime.fromisoformat(row["occurred_at"]).astimezone(UTC),
        )
