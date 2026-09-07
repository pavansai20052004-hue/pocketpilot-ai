"""Typed domain and API models for repository inspection and command execution."""

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, field_validator


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


class DebugState(StrEnum):
    IDLE = "IDLE"
    CAPTURED = "CAPTURED"
    ANALYZING = "ANALYZING"
    ROOT_CAUSE_FOUND = "ROOT_CAUSE_FOUND"
    PATCH_GENERATED = "PATCH_GENERATED"
    AWAITING_APPROVAL = "AWAITING_APPROVAL"
    PATCH_APPLYING = "PATCH_APPLYING"
    TESTING = "TESTING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    ROLLED_BACK = "ROLLED_BACK"


class AgentEventName(StrEnum):
    SESSION_STARTED = "session_started"
    ERROR_CAPTURED = "error_captured"
    IMAGE_RECEIVED = "image_received"
    OCR_COMPLETED = "ocr_completed"
    ANALYSIS_STARTED = "analysis_started"
    ANALYSIS_REQUESTED = "analysis_requested"
    ERROR_PARSED = "error_parsed"
    CONTEXT_COLLECTION_STARTED = "context_collection_started"
    CONTEXT_FILE_SELECTED = "context_file_selected"
    CONTEXT_COLLECTION_COMPLETED = "context_collection_completed"
    ANALYSIS_PROVIDER_STARTED = "analysis_provider_started"
    ANALYSIS_PROVIDER_COMPLETED = "analysis_provider_completed"
    ANALYSIS_VALIDATION_COMPLETED = "analysis_validation_completed"
    ANALYSIS_FAILED = "analysis_failed"
    ROOT_CAUSE_FOUND = "root_cause_found"
    PATCH_GENERATED = "patch_generated"
    PATCH_GENERATION_STARTED = "patch_generation_started"
    PATCH_VALIDATION_STARTED = "patch_validation_started"
    PATCH_VALIDATION_COMPLETED = "patch_validation_completed"
    PATCH_AWAITING_APPROVAL = "patch_awaiting_approval"
    APPROVAL_REQUESTED = "approval_requested"
    PATCH_APPROVED = "patch_approved"
    PATCH_REJECTED = "patch_rejected"
    PATCH_APPLY_STARTED = "patch_apply_started"
    PATCH_FILE_APPLIED = "patch_file_applied"
    PATCH_APPLIED = "patch_applied"
    PATCH_APPLY_FAILED = "patch_apply_failed"
    TESTS_STARTED = "tests_started"
    TESTS_PASSED = "tests_passed"
    TESTS_FAILED = "tests_failed"
    SESSION_FAILED = "session_failed"
    RETRY_STARTED = "retry_started"
    ROLLBACK_COMPLETED = "rollback_completed"
    ROLLBACK_STARTED = "rollback_started"
    ROLLBACK_FAILED = "rollback_failed"


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


class DebugSession(StrictModel):
    id: str
    title: str
    state: DebugState
    revision: int = Field(ge=0)
    retry_count: int = Field(ge=0, le=2)
    created_at: datetime
    updated_at: datetime
    last_event_sequence: int = Field(ge=1)


class AgentEvent(StrictModel):
    id: str
    session_id: str
    sequence: int = Field(ge=1)
    name: AgentEventName
    state: DebugState
    summary: str
    occurred_at: datetime


class CreateDebugSessionRequest(StrictModel):
    title: str = Field(default="Untitled debug session", min_length=1, max_length=120)

    @field_validator("title")
    @classmethod
    def title_must_have_visible_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Session title must contain visible text.")
        return normalized


class TransitionDebugSessionRequest(StrictModel):
    target_state: DebugState
    expected_revision: int = Field(ge=0)
    summary: str = Field(min_length=1, max_length=500)

    @field_validator("summary")
    @classmethod
    def summary_must_have_visible_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Transition summary must contain visible text.")
        return normalized


class SessionTransitionResult(StrictModel):
    session: DebugSession
    event: AgentEvent


class SessionEventList(StrictModel):
    session_id: str
    current_state: DebugState
    current_revision: int = Field(ge=0)
    events: list[AgentEvent]


class SessionList(StrictModel):
    sessions: list[DebugSession]


class ErrorInputType(StrEnum):
    TEXT = "TEXT"
    CAMERA = "CAMERA"
    GALLERY = "GALLERY"
    VOICE = "VOICE"
    CLIPBOARD = "CLIPBOARD"


class ActionSource(StrEnum):
    DESKTOP_UI = "DESKTOP_UI"
    MOBILE_UI = "MOBILE_UI"
    VOICE = "VOICE"


class AnalysisStatus(StrEnum):
    COMPLETED = "COMPLETED"
    PROVIDER_UNAVAILABLE = "PROVIDER_UNAVAILABLE"
    MODEL_NOT_FOUND = "MODEL_NOT_FOUND"
    TIMEOUT = "TIMEOUT"
    INVALID_RESPONSE = "INVALID_RESPONSE"


class AnalysisConfidence(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class ErrorFrame(StrictModel):
    path: str | None = None
    line: int | None = Field(default=None, ge=1)
    symbol: str | None = None


class ParsedError(StrictModel):
    language: str
    framework: str | None = None
    package_or_module: str | None = None
    exception_type: str | None
    message: str
    frames: list[ErrorFrame]


class ContextFileSummary(StrictModel):
    relative_path: str
    language: str | None
    line_start: int = Field(ge=1)
    line_end: int = Field(ge=1)
    score: int = Field(ge=0)
    reason: str


class AnalysisRepositorySummary(StrictModel):
    project_types: list[str]
    frameworks: list[str]
    build_systems: list[str]


class AnalysisRequest(StrictModel):
    session_id: str
    parsed_error: ParsedError
    repository_summary: AnalysisRepositorySummary
    context_files: list[ContextFileSummary]
    language: str
    framework: str | None
    retry_number: int = Field(ge=0, le=2)


class AnalysisEvidence(StrictModel):
    relative_path: str
    line: int | None = Field(default=None, ge=1)
    observation: str = Field(min_length=1, max_length=500)


class AnalysisResult(StrictModel):
    summary: str = Field(min_length=1, max_length=1000)
    root_cause: str = Field(min_length=1, max_length=3000)
    explanation: str = Field(min_length=1, max_length=3000)
    repair_strategy: str = Field(min_length=1, max_length=2000)
    assumptions: list[str] = Field(max_length=12)
    confidence: AnalysisConfidence
    likely_file: str | None = None
    likely_line: int | None = Field(default=None, ge=1)
    likely_symbol: str | None = None
    evidence: list[AnalysisEvidence] = Field(max_length=12)
    related_files: list[str] = Field(max_length=12)
    warnings: list[str] = Field(max_length=12)


class AnalysisTimings(StrictModel):
    parse_ms: int = Field(ge=0)
    context_ms: int = Field(ge=0)
    provider_ms: int = Field(ge=0)
    validation_ms: int = Field(ge=0)
    total_ms: int = Field(ge=0)


class AnalyzeSessionRequest(StrictModel):
    input_type: ErrorInputType = ErrorInputType.TEXT
    raw_text: str = Field(min_length=1, max_length=50_000)
    file_hint: str | None = Field(default=None, max_length=1000)
    language_hint: str | None = Field(default=None, max_length=100)
    framework_hint: str | None = Field(default=None, max_length=100)
    expected_revision: int = Field(ge=0)
    action_source: ActionSource = ActionSource.MOBILE_UI

    @field_validator("raw_text")
    @classmethod
    def error_text_must_have_visible_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Error text must contain visible text.")
        return value.strip()


class AnalysisRecord(StrictModel):
    session_id: str
    input_source: ErrorInputType = ErrorInputType.TEXT
    status: AnalysisStatus
    provider: str
    model: str
    parsed_error: ParsedError
    context_files: list[ContextFileSummary]
    context_truncated: bool
    result: AnalysisResult
    timings: AnalysisTimings
    created_at: datetime


class AnalysisExecutionResponse(StrictModel):
    session: DebugSession
    analysis: AnalysisRecord


class ProviderHealth(StrictModel):
    provider: str
    model: str
    status: AnalysisStatus | None
    available: bool
    model_available: bool
    latency_ms: int = Field(ge=0)
    detail: str


class PatchRisk(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    BLOCKED = "BLOCKED"


class PatchStatus(StrEnum):
    PROPOSED = "PROPOSED"
    AWAITING_APPROVAL = "AWAITING_APPROVAL"
    REJECTED = "REJECTED"
    APPROVED = "APPROVED"
    APPLYING = "APPLYING"
    APPLIED = "APPLIED"
    VERIFIED = "VERIFIED"
    FAILED = "FAILED"
    ROLLED_BACK = "ROLLED_BACK"
    RECOVERY_REQUIRED = "RECOVERY_REQUIRED"


class PatchChangeType(StrEnum):
    MODIFY = "MODIFY"


class RollbackStatus(StrEnum):
    AVAILABLE = "AVAILABLE"
    COMPLETED = "COMPLETED"
    CONFLICT = "CONFLICT"
    UNAVAILABLE = "UNAVAILABLE"


class PatchFileChange(StrictModel):
    relative_path: str
    change_type: PatchChangeType = PatchChangeType.MODIFY
    unified_diff: str = Field(min_length=1, max_length=100_000)
    explanation: str = Field(min_length=1, max_length=1000)
    original_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    additions: int = Field(ge=0)
    deletions: int = Field(ge=0)


class PatchValidationResult(StrictModel):
    valid: bool
    risk: PatchRisk
    errors: list[str]
    warnings: list[str]
    files_changed: int = Field(ge=0)
    additions: int = Field(ge=0)
    deletions: int = Field(ge=0)
    duration_ms: int = Field(ge=0)


class PatchProposal(StrictModel):
    id: str
    session_id: str
    title: str = Field(min_length=1, max_length=200)
    summary: str = Field(min_length=1, max_length=2000)
    rationale: str = Field(min_length=1, max_length=3000)
    confidence: AnalysisConfidence
    files: list[PatchFileChange] = Field(min_length=1, max_length=5)
    expected_effect: str = Field(min_length=1, max_length=2000)
    risks: list[str] = Field(max_length=20)
    validation_notes: list[str] = Field(max_length=20)
    created_at: datetime
    provider: str
    model: str
    retry_number: int = Field(ge=0, le=2)
    generation_duration_ms: int = Field(ge=0)


class PatchProviderFile(StrictModel):
    relative_path: str
    unified_diff: str
    explanation: str


class PatchProviderOutput(StrictModel):
    title: str
    summary: str
    rationale: str
    confidence: AnalysisConfidence
    files: list[PatchProviderFile] = Field(min_length=1, max_length=5)
    expected_effect: str
    risks: list[str] = Field(default_factory=list)
    validation_notes: list[str] = Field(default_factory=list)


class GeneratePatchRequest(StrictModel):
    expected_revision: int = Field(ge=0)
    action_source: ActionSource = ActionSource.MOBILE_UI


class PatchDecisionRequest(StrictModel):
    expected_revision: int = Field(ge=0)
    action_source: ActionSource = ActionSource.MOBILE_UI


class PatchApplicationResult(StrictModel):
    patch_id: str
    status: PatchStatus
    files_changed: int = Field(ge=0)
    applied_at: datetime | None
    duration_ms: int = Field(ge=0)
    error: str | None = None


class ValidationResult(StrictModel):
    patch_id: str
    command: CommandRun | None
    passed: bool
    duration_ms: int = Field(ge=0)
    detail: str


class PatchWorkflowView(StrictModel):
    session_id: str
    status: PatchStatus
    proposal: PatchProposal
    validation: PatchValidationResult
    application: PatchApplicationResult | None
    test_result: ValidationResult | None
    rollback_status: RollbackStatus
    rollback_duration_ms: int | None = Field(default=None, ge=0)
    updated_at: datetime


class PatchGenerationResponse(StrictModel):
    session: DebugSession
    workflow: PatchWorkflowView


class PatchActionResponse(StrictModel):
    session: DebugSession
    workflow: PatchWorkflowView


class DevicePermission(StrEnum):
    READ_SESSION = "READ_SESSION"
    ANALYZE = "ANALYZE"
    GENERATE_PATCH = "GENERATE_PATCH"
    APPROVE_PATCH = "APPROVE_PATCH"
    RUN_VALIDATION = "RUN_VALIDATION"
    ROLLBACK = "ROLLBACK"


class DeviceStatus(StrEnum):
    CONNECTED = "CONNECTED"
    REVOKED = "REVOKED"


class PairingCodeView(StrictModel):
    code: str = Field(pattern=r"^\d{6}$")
    expires_at: datetime
    attempts_remaining: int = Field(ge=0)
    agent_address: str


class PairDeviceRequest(StrictModel):
    code: str = Field(pattern=r"^\d{6}$")
    display_name: str = Field(min_length=1, max_length=80)

    @field_validator("display_name")
    @classmethod
    def display_name_must_have_visible_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Device name must contain visible text.")
        return normalized


class DeviceView(StrictModel):
    device_id: str
    display_name: str
    paired_at: datetime
    last_seen: datetime
    status: DeviceStatus
    token_created_at: datetime
    token_expires_at: datetime
    permissions: list[DevicePermission]


class PairDeviceResponse(StrictModel):
    device: DeviceView
    token: str


class DeviceList(StrictModel):
    devices: list[DeviceView]


class DemoHealthStatus(StrEnum):
    READY = "READY"
    TOOL_MISSING = "TOOL_MISSING"
    BROKEN_SETUP = "BROKEN_SETUP"


class DemoProject(StrictModel):
    id: str
    name: str
    language: str
    framework: str
    expected_error_type: str
    expected_file: str
    critical_ocr_tokens: list[str]
    status: DemoHealthStatus
    detail: str
    validation_duration_ms: int = Field(ge=0)


class DemoProjectList(StrictModel):
    demos: list[DemoProject]


class DemoSelection(StrictModel):
    demo: DemoProject
    workspace: WorkspaceInfo


class DemoResetResult(StrictModel):
    demo: DemoProject
    result: str
    restored_files: list[str]


class DemoResetAllResult(StrictModel):
    demos: list[DemoResetResult]
    overall: str


class PreDemoCheck(StrictModel):
    name: str
    status: str
    detail: str


class PreDemoCheckResult(StrictModel):
    title: str = "POCKETPILOT DEMO READINESS"
    checks: list[PreDemoCheck]
    overall: str
    provider: str
    model: str


class PrepareDemoResult(StrictModel):
    demo: DemoProject
    workspace: WorkspaceInfo
    readiness: PreDemoCheckResult
    result: str = "READY_FOR_NEXT_DEMO"
