"""Typed domain and API models for repository inspection and command execution."""

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    """Boundary model that rejects undeclared fields."""

    model_config = ConfigDict(extra="forbid")


class FileCategory(StrEnum):
    SOURCE = "source"
    TEST = "test"
    CONFIG = "config"
    BUILD = "build"
    DOCUMENTATION = "documentation"
    EXCLUDED_SENSITIVE = "excluded_sensitive"
    GENERATED = "generated"


class DetectionConfidence(StrEnum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class CommandStatus(StrEnum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    PASSED = "PASSED"
    FAILED = "FAILED"
    TIMED_OUT = "TIMED_OUT"
    NOT_AVAILABLE = "NOT_AVAILABLE"
    CANCELLED = "CANCELLED"


class CommandCategory(StrEnum):
    TEST = "test"
    BUILD = "build"
    TYPECHECK = "typecheck"
    LINT = "lint"


class DetectedLanguage(StrictModel):
    name: str
    files: int = Field(ge=1)


class DetectedFramework(StrictModel):
    name: str
    confidence: DetectionConfidence
    evidence: list[str]


class DetectedProject(StrictModel):
    project_type: str
    relative_root: str
    evidence: list[str]


class RepositoryFile(StrictModel):
    relative_path: str
    extension: str
    language: str | None
    size_bytes: int = Field(ge=0)
    modified_time: datetime
    category: FileCategory


class SafeCommand(StrictModel):
    id: str
    label: str
    category: CommandCategory
    executable: str
    args: list[str]
    display_command: str
    working_directory: str
    evidence: str


class WorkspaceInfo(StrictModel):
    id: str
    root_path: str
    name: str
    exists: bool
    readable: bool
    project_types: list[DetectedProject]
    languages: list[DetectedLanguage]
    frameworks: list[DetectedFramework]
    build_systems: list[str]
    package_managers: list[str]
    file_count: int = Field(ge=0)
    relevant_file_count: int = Field(ge=0)
    total_size: int = Field(ge=0)
    git_detected: bool
    git_branch: str | None
    detected_commands: list[SafeCommand]
    scan_truncated: bool
    scan_duration_ms: int = Field(ge=0)


class RepositoryFileIndex(StrictModel):
    workspace_id: str
    files: list[RepositoryFile]
    scan_truncated: bool


class SafeCommandList(StrictModel):
    workspace_id: str
    commands: list[SafeCommand]


class CommandRun(StrictModel):
    id: str
    workspace_id: str
    command_id: str
    display_command: str
    status: CommandStatus
    exit_code: int | None
    duration_ms: int = Field(ge=0)
    stdout: str
    stderr: str
    output_truncated: bool
    timed_out: bool
    started_at: datetime
    completed_at: datetime


class InspectWorkspaceRequest(StrictModel):
    root_path: str = Field(min_length=1, max_length=4096)


class ErrorResponse(StrictModel):
    detail: str
