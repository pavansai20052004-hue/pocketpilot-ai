"""Local SQLite persistence for validated analysis results."""

import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

from pocketpilot_agent.models import (
    AnalysisRecord,
    AnalysisResult,
    AnalysisStatus,
    AnalysisTimings,
    ContextFileSummary,
    ErrorInputType,
    ParsedError,
)


class AnalysisNotFoundError(LookupError):
    pass


class AnalysisStore:
    def __init__(self, database_path: str) -> None:
        self.database_path = Path(database_path).resolve()
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            connection.execute(
                """CREATE TABLE IF NOT EXISTS analysis_results (
                    session_id TEXT PRIMARY KEY,
                    input_source TEXT NOT NULL DEFAULT 'TEXT',
                    status TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    model TEXT NOT NULL,
                    parsed_error_json TEXT NOT NULL,
                    context_files_json TEXT NOT NULL,
                    context_truncated INTEGER NOT NULL DEFAULT 0,
                    result_json TEXT NOT NULL,
                    timings_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (session_id) REFERENCES debug_sessions(id) ON DELETE CASCADE
                )"""
            )
            columns = {
                row["name"]
                for row in connection.execute("PRAGMA table_info(analysis_results)")
            }
            if "context_truncated" not in columns:
                connection.execute(
                    "ALTER TABLE analysis_results ADD COLUMN "
                    "context_truncated INTEGER NOT NULL DEFAULT 0"
                )
            if "input_source" not in columns:
                connection.execute(
                    "ALTER TABLE analysis_results ADD COLUMN "
                    "input_source TEXT NOT NULL DEFAULT 'TEXT'"
                )

    def save(self, record: AnalysisRecord) -> None:
        with self._connect() as connection:
            connection.execute(
                """INSERT INTO analysis_results
                (session_id, input_source, status, provider, model,
                 parsed_error_json, context_files_json, context_truncated,
                 result_json, timings_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(session_id) DO UPDATE SET status=excluded.status,
                input_source=excluded.input_source, provider=excluded.provider,
                model=excluded.model,
                parsed_error_json=excluded.parsed_error_json,
                context_files_json=excluded.context_files_json,
                context_truncated=excluded.context_truncated,
                result_json=excluded.result_json, timings_json=excluded.timings_json,
                created_at=excluded.created_at""",
                (
                    record.session_id,
                    record.input_source,
                    record.status,
                    record.provider,
                    record.model,
                    record.parsed_error.model_dump_json(),
                    json.dumps([item.model_dump(mode="json") for item in record.context_files]),
                    int(record.context_truncated),
                    record.result.model_dump_json(),
                    record.timings.model_dump_json(),
                    record.created_at.isoformat(),
                ),
            )

    def get(self, session_id: str) -> AnalysisRecord:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM analysis_results WHERE session_id = ?", (session_id,)
            ).fetchone()
        if row is None:
            raise AnalysisNotFoundError("No completed analysis exists for this session.")
        return AnalysisRecord(
            session_id=row["session_id"],
            input_source=ErrorInputType(row["input_source"]),
            status=AnalysisStatus(row["status"]),
            provider=row["provider"],
            model=row["model"],
            parsed_error=ParsedError.model_validate_json(row["parsed_error_json"]),
            context_files=[
                ContextFileSummary.model_validate(item)
                for item in json.loads(row["context_files_json"])
            ],
            context_truncated=bool(row["context_truncated"]),
            result=AnalysisResult.model_validate_json(row["result_json"]),
            timings=AnalysisTimings.model_validate_json(row["timings_json"]),
            created_at=datetime.fromisoformat(row["created_at"]).astimezone(UTC),
        )

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path, timeout=5)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection
