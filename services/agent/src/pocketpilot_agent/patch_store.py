"""Durable patch, approval, validation, test, and private rollback persistence."""

from __future__ import annotations

import sqlite3
from datetime import UTC, datetime
from pathlib import Path

from pydantic import BaseModel, ConfigDict

from pocketpilot_agent.models import (
    PatchApplicationResult,
    PatchProposal,
    PatchStatus,
    PatchValidationResult,
    PatchWorkflowView,
    RollbackStatus,
    ValidationResult,
)


class PatchNotFoundError(LookupError):
    pass


class RollbackFileSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")
    relative_path: str
    original_content: str
    original_sha256: str
    patched_sha256: str


class RollbackSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    session_id: str
    patch_id: str
    files: list[RollbackFileSnapshot]
    created_at: datetime
    applied_revision: int


class PatchWorkflowRecord:
    def __init__(
        self,
        *,
        status: PatchStatus,
        proposal: PatchProposal,
        validation: PatchValidationResult,
        application: PatchApplicationResult | None = None,
        test_result: ValidationResult | None = None,
        rollback_status: RollbackStatus = RollbackStatus.UNAVAILABLE,
        rollback_duration_ms: int | None = None,
        snapshot: RollbackSnapshot | None = None,
        updated_at: datetime | None = None,
    ) -> None:
        self.status = status
        self.proposal = proposal
        self.validation = validation
        self.application = application
        self.test_result = test_result
        self.rollback_status = rollback_status
        self.rollback_duration_ms = rollback_duration_ms
        self.snapshot = snapshot
        self.updated_at = updated_at or datetime.now(UTC)

    def view(self) -> PatchWorkflowView:
        return PatchWorkflowView(
            session_id=self.proposal.session_id,
            status=self.status,
            proposal=self.proposal,
            validation=self.validation,
            application=self.application,
            test_result=self.test_result,
            rollback_status=self.rollback_status,
            rollback_duration_ms=self.rollback_duration_ms,
            updated_at=self.updated_at,
        )


class PatchStore:
    def __init__(self, database_path: str) -> None:
        self.database_path = Path(database_path).resolve()
        with self._connect() as connection:
            connection.execute(
                """CREATE TABLE IF NOT EXISTS patch_workflows (
                    session_id TEXT PRIMARY KEY,
                    patch_id TEXT NOT NULL UNIQUE,
                    status TEXT NOT NULL,
                    proposal_json TEXT NOT NULL,
                    validation_json TEXT NOT NULL,
                    application_json TEXT,
                    test_result_json TEXT,
                    rollback_status TEXT NOT NULL,
                    rollback_duration_ms INTEGER,
                    snapshot_json TEXT,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY (session_id) REFERENCES debug_sessions(id) ON DELETE CASCADE
                )"""
            )
            columns = {
                row["name"]
                for row in connection.execute("PRAGMA table_info(patch_workflows)")
            }
            if "rollback_duration_ms" not in columns:
                connection.execute(
                    "ALTER TABLE patch_workflows ADD COLUMN rollback_duration_ms INTEGER"
                )
            connection.execute(
                """UPDATE patch_workflows SET status = ?
                WHERE status = ?""",
                (PatchStatus.RECOVERY_REQUIRED, PatchStatus.APPLYING),
            )

    def save(self, record: PatchWorkflowRecord) -> None:
        record.updated_at = datetime.now(UTC)
        with self._connect() as connection:
            connection.execute(
                """INSERT INTO patch_workflows
                (session_id, patch_id, status, proposal_json, validation_json,
                 application_json, test_result_json, rollback_status, rollback_duration_ms,
                 snapshot_json, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(session_id) DO UPDATE SET patch_id=excluded.patch_id,
                status=excluded.status, proposal_json=excluded.proposal_json,
                validation_json=excluded.validation_json,
                application_json=excluded.application_json,
                test_result_json=excluded.test_result_json,
                rollback_status=excluded.rollback_status,
                rollback_duration_ms=excluded.rollback_duration_ms,
                snapshot_json=excluded.snapshot_json, updated_at=excluded.updated_at""",
                (
                    record.proposal.session_id,
                    record.proposal.id,
                    record.status,
                    record.proposal.model_dump_json(),
                    record.validation.model_dump_json(),
                    record.application.model_dump_json() if record.application else None,
                    record.test_result.model_dump_json() if record.test_result else None,
                    record.rollback_status,
                    record.rollback_duration_ms,
                    record.snapshot.model_dump_json() if record.snapshot else None,
                    record.updated_at.isoformat(),
                ),
            )

    def get(self, session_id: str) -> PatchWorkflowRecord:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM patch_workflows WHERE session_id = ?", (session_id,)
            ).fetchone()
        if row is None:
            raise PatchNotFoundError("No patch proposal exists for this session.")
        return PatchWorkflowRecord(
            status=PatchStatus(row["status"]),
            proposal=PatchProposal.model_validate_json(row["proposal_json"]),
            validation=PatchValidationResult.model_validate_json(row["validation_json"]),
            application=(
                PatchApplicationResult.model_validate_json(row["application_json"])
                if row["application_json"]
                else None
            ),
            test_result=(
                ValidationResult.model_validate_json(row["test_result_json"])
                if row["test_result_json"]
                else None
            ),
            rollback_status=RollbackStatus(row["rollback_status"]),
            rollback_duration_ms=row["rollback_duration_ms"],
            snapshot=(
                RollbackSnapshot.model_validate_json(row["snapshot_json"])
                if row["snapshot_json"]
                else None
            ),
            updated_at=datetime.fromisoformat(row["updated_at"]).astimezone(UTC),
        )

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path, timeout=5)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection
