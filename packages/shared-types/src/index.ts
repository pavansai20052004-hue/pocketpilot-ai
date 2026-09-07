export const DEBUG_STATES = [
  'IDLE',
  'CAPTURED',
  'ANALYZING',
  'ROOT_CAUSE_FOUND',
  'PATCH_GENERATED',
  'AWAITING_APPROVAL',
  'PATCH_APPLYING',
  'TESTING',
  'SUCCESS',
  'FAILED',
  'ROLLED_BACK',
] as const;

export type DebugState = (typeof DEBUG_STATES)[number];

export const AGENT_EVENT_NAMES = [
  'session_started',
  'error_captured',
  'image_received',
  'ocr_completed',
  'analysis_started',
  'analysis_requested',
  'error_parsed',
  'context_collection_started',
  'context_file_selected',
  'context_collection_completed',
  'analysis_provider_started',
  'analysis_provider_completed',
  'analysis_validation_completed',
  'analysis_failed',
  'root_cause_found',
  'patch_generated',
  'patch_generation_started',
  'patch_validation_started',
  'patch_validation_completed',
  'patch_awaiting_approval',
  'approval_requested',
  'patch_approved',
  'patch_rejected',
  'patch_apply_started',
  'patch_file_applied',
  'patch_applied',
  'patch_apply_failed',
  'tests_started',
  'tests_passed',
  'tests_failed',
  'session_failed',
  'retry_started',
  'rollback_completed',
  'rollback_started',
  'rollback_failed',
] as const;

export type AgentEventName = (typeof AGENT_EVENT_NAMES)[number];

export type ComponentReadiness = 'ready' | 'unavailable' | 'not_configured';

export interface SystemStatus {
  readonly service: string;
  readonly version: string;
  readonly environment: string;
  readonly components: {
    readonly api: ComponentReadiness;
    readonly workspace: ComponentReadiness;
    readonly model: ComponentReadiness;
  };
}

export interface AgentEvent {
  readonly id: string;
  readonly session_id: string;
  readonly sequence: number;
  readonly name: AgentEventName;
  readonly state: DebugState;
  readonly summary: string;
  readonly occurred_at: string;
}

export interface DebugSession {
  readonly id: string;
  readonly title: string;
  readonly state: DebugState;
  readonly revision: number;
  readonly retry_count: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly last_event_sequence: number;
}

export interface SessionTransitionResult {
  readonly session: DebugSession;
  readonly event: AgentEvent;
}

export interface SessionEventList {
  readonly session_id: string;
  readonly current_state: DebugState;
  readonly current_revision: number;
  readonly events: ReadonlyArray<AgentEvent>;
}

export interface SessionList {
  readonly sessions: ReadonlyArray<DebugSession>;
}

export type SessionWebSocketMessage =
  | {
      readonly type: 'snapshot';
      readonly session: DebugSession;
      readonly events: ReadonlyArray<AgentEvent>;
      readonly patch?: PatchWorkflowView | null;
    }
  | {
      readonly type: 'event';
      readonly event: AgentEvent;
    };

export interface CreateDebugSessionRequest {
  readonly title: string;
}

export interface TransitionDebugSessionRequest {
  readonly target_state: DebugState;
  readonly expected_revision: number;
  readonly summary: string;
}

export const COMMAND_STATUSES = [
  'PENDING',
  'RUNNING',
  'PASSED',
  'FAILED',
  'TIMED_OUT',
  'NOT_AVAILABLE',
  'CANCELLED',
] as const;

export type CommandStatus = (typeof COMMAND_STATUSES)[number];
export type CommandCategory = 'test' | 'build' | 'typecheck' | 'lint';
export type DetectionConfidence = 'high' | 'medium' | 'low';
export type FileCategory =
  | 'source'
  | 'test'
  | 'config'
  | 'build'
  | 'documentation'
  | 'excluded_sensitive'
  | 'generated';

export interface DetectedLanguage {
  readonly name: string;
  readonly files: number;
}

export interface DetectedFramework {
  readonly name: string;
  readonly confidence: DetectionConfidence;
  readonly evidence: ReadonlyArray<string>;
}

export interface DetectedProject {
  readonly project_type: string;
  readonly relative_root: string;
  readonly evidence: ReadonlyArray<string>;
}

export interface RepositoryFile {
  readonly relative_path: string;
  readonly extension: string;
  readonly language: string | null;
  readonly size_bytes: number;
  readonly modified_time: string;
  readonly category: FileCategory;
}

export interface SafeCommand {
  readonly id: string;
  readonly label: string;
  readonly category: CommandCategory;
  readonly executable: string;
  readonly args: ReadonlyArray<string>;
  readonly display_command: string;
  readonly working_directory: string;
  readonly evidence: string;
}

export interface WorkspaceInfo {
  readonly id: string;
  readonly root_path: string;
  readonly name: string;
  readonly exists: boolean;
  readonly readable: boolean;
  readonly project_types: ReadonlyArray<DetectedProject>;
  readonly languages: ReadonlyArray<DetectedLanguage>;
  readonly frameworks: ReadonlyArray<DetectedFramework>;
  readonly build_systems: ReadonlyArray<string>;
  readonly package_managers: ReadonlyArray<string>;
  readonly file_count: number;
  readonly relevant_file_count: number;
  readonly total_size: number;
  readonly git_detected: boolean;
  readonly git_branch: string | null;
  readonly detected_commands: ReadonlyArray<SafeCommand>;
  readonly scan_truncated: boolean;
  readonly scan_duration_ms: number;
}

export interface RepositoryFileIndex {
  readonly workspace_id: string;
  readonly files: ReadonlyArray<RepositoryFile>;
  readonly scan_truncated: boolean;
}

export interface SafeCommandList {
  readonly workspace_id: string;
  readonly commands: ReadonlyArray<SafeCommand>;
}

export interface CommandRun {
  readonly id: string;
  readonly workspace_id: string;
  readonly command_id: string;
  readonly display_command: string;
  readonly status: CommandStatus;
  readonly exit_code: number | null;
  readonly duration_ms: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly output_truncated: boolean;
  readonly timed_out: boolean;
  readonly started_at: string;
  readonly completed_at: string;
}

export type ErrorInputType = 'TEXT' | 'CAMERA' | 'GALLERY' | 'VOICE' | 'CLIPBOARD';
export type ActionSource = 'DESKTOP_UI' | 'MOBILE_UI' | 'VOICE';
export type VisionInputSource = 'CAMERA' | 'GALLERY';
export type OcrQualityLevel = 'GOOD' | 'REVIEW' | 'POOR';
export type OcrWarningCode =
  | 'EMPTY_TEXT'
  | 'SHORT_TEXT'
  | 'LOW_TECHNICAL_SIGNAL'
  | 'NOISY_TEXT'
  | 'POSSIBLE_SECRET'
  | 'POSSIBLE_PROMPT_INJECTION'
  | 'TEXT_TRIMMED_TO_ERROR';

export interface OcrBoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface OcrTextBlock {
  readonly text: string;
  readonly bounding_box: OcrBoundingBox | null;
  readonly confidence: number | null;
}

export interface OcrQuality {
  readonly level: OcrQualityLevel;
  readonly score: number;
  readonly warnings: ReadonlyArray<OcrWarningCode>;
}

export interface OcrResult {
  readonly source: VisionInputSource;
  readonly raw_text: string;
  readonly normalized_text: string;
  readonly blocks: ReadonlyArray<OcrTextBlock>;
  readonly quality: OcrQuality;
  readonly image_width: number;
  readonly image_height: number;
  readonly orientation_degrees: 0 | 90 | 180 | 270;
  readonly duration_ms: number;
  readonly created_at: string;
}
export type AnalysisStatus = 'COMPLETED' | 'PROVIDER_UNAVAILABLE' | 'MODEL_NOT_FOUND' | 'TIMEOUT' | 'INVALID_RESPONSE';
export type AnalysisConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ErrorFrame { readonly path: string | null; readonly line: number | null; readonly symbol: string | null; }
export interface ParsedError { readonly language: string; readonly framework: string | null; readonly package_or_module: string | null; readonly exception_type: string | null; readonly message: string; readonly frames: ReadonlyArray<ErrorFrame>; }
export interface ContextFileSummary { readonly relative_path: string; readonly language: string | null; readonly line_start: number; readonly line_end: number; readonly score: number; readonly reason: string; }
export interface AnalysisEvidence { readonly relative_path: string; readonly line: number | null; readonly observation: string; }
export interface AnalysisResult {
  readonly summary: string;
  readonly root_cause: string;
  readonly explanation: string;
  readonly repair_strategy: string;
  readonly assumptions: ReadonlyArray<string>;
  readonly confidence: AnalysisConfidence;
  readonly likely_file: string | null;
  readonly likely_line: number | null;
  readonly likely_symbol: string | null;
  readonly evidence: ReadonlyArray<AnalysisEvidence>;
  readonly related_files: ReadonlyArray<string>;
  readonly warnings: ReadonlyArray<string>;
}
export interface AnalysisTimings { readonly parse_ms: number; readonly context_ms: number; readonly provider_ms: number; readonly validation_ms: number; readonly total_ms: number; }
export interface AnalysisRecord {
  readonly session_id: string;
  readonly input_source: ErrorInputType;
  readonly status: AnalysisStatus;
  readonly provider: string;
  readonly model: string;
  readonly parsed_error: ParsedError;
  readonly context_files: ReadonlyArray<ContextFileSummary>;
  readonly context_truncated: boolean;
  readonly result: AnalysisResult;
  readonly timings: AnalysisTimings;
  readonly created_at: string;
}
export interface AnalysisExecutionResponse { readonly session: DebugSession; readonly analysis: AnalysisRecord; }
export interface AnalyzeSessionRequest { readonly input_type: ErrorInputType; readonly raw_text: string; readonly file_hint?: string | null; readonly language_hint?: string | null; readonly expected_revision: number; readonly action_source?: ActionSource; }
export interface ProviderHealth { readonly provider: string; readonly model: string; readonly status: AnalysisStatus | null; readonly available: boolean; readonly model_available: boolean; readonly latency_ms: number; readonly detail: string; }

export type PatchRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKED';
export type PatchStatus = 'PROPOSED' | 'AWAITING_APPROVAL' | 'REJECTED' | 'APPROVED' | 'APPLYING' | 'APPLIED' | 'VERIFIED' | 'FAILED' | 'ROLLED_BACK' | 'RECOVERY_REQUIRED';
export type RollbackStatus = 'AVAILABLE' | 'COMPLETED' | 'CONFLICT' | 'UNAVAILABLE';
export interface PatchFileChange { readonly relative_path: string; readonly change_type: 'MODIFY'; readonly unified_diff: string; readonly explanation: string; readonly original_sha256: string; readonly additions: number; readonly deletions: number; }
export interface PatchValidationResult { readonly valid: boolean; readonly risk: PatchRisk; readonly errors: ReadonlyArray<string>; readonly warnings: ReadonlyArray<string>; readonly files_changed: number; readonly additions: number; readonly deletions: number; readonly duration_ms: number; }
export interface PatchProposal { readonly id: string; readonly session_id: string; readonly title: string; readonly summary: string; readonly rationale: string; readonly confidence: AnalysisConfidence; readonly files: ReadonlyArray<PatchFileChange>; readonly expected_effect: string; readonly risks: ReadonlyArray<string>; readonly validation_notes: ReadonlyArray<string>; readonly created_at: string; readonly provider: string; readonly model: string; readonly retry_number: number; readonly generation_duration_ms: number; }
export interface PatchApplicationResult { readonly patch_id: string; readonly status: PatchStatus; readonly files_changed: number; readonly applied_at: string | null; readonly duration_ms: number; readonly error: string | null; }
export interface ValidationResult { readonly patch_id: string; readonly command: CommandRun | null; readonly passed: boolean; readonly duration_ms: number; readonly detail: string; }
export interface PatchWorkflowView { readonly session_id: string; readonly status: PatchStatus; readonly proposal: PatchProposal; readonly validation: PatchValidationResult; readonly application: PatchApplicationResult | null; readonly test_result: ValidationResult | null; readonly rollback_status: RollbackStatus; readonly rollback_duration_ms: number | null; readonly updated_at: string; }
export interface PatchGenerationResponse { readonly session: DebugSession; readonly workflow: PatchWorkflowView; }
export interface PatchActionResponse { readonly session: DebugSession; readonly workflow: PatchWorkflowView; }

export type DevicePermission = 'READ_SESSION' | 'ANALYZE' | 'GENERATE_PATCH' | 'APPROVE_PATCH' | 'RUN_VALIDATION' | 'ROLLBACK';
export type DeviceStatus = 'CONNECTED' | 'REVOKED';
export interface PairingCodeView { readonly code: string; readonly expires_at: string; readonly attempts_remaining: number; readonly agent_address: string; }
export interface PairDeviceRequest { readonly code: string; readonly display_name: string; }
export interface DeviceView { readonly device_id: string; readonly display_name: string; readonly paired_at: string; readonly last_seen: string; readonly status: DeviceStatus; readonly token_created_at: string; readonly token_expires_at: string; readonly permissions: ReadonlyArray<DevicePermission>; }
export interface PairDeviceResponse { readonly device: DeviceView; readonly token: string; }
export interface DeviceList { readonly devices: ReadonlyArray<DeviceView>; }

export type DemoHealthStatus = 'READY' | 'TOOL_MISSING' | 'BROKEN_SETUP';
export interface DemoProject {
  readonly id: string;
  readonly name: string;
  readonly language: string;
  readonly framework: string;
  readonly expected_error_type: string;
  readonly expected_file: string;
  readonly critical_ocr_tokens: ReadonlyArray<string>;
  readonly status: DemoHealthStatus;
  readonly detail: string;
  readonly validation_duration_ms: number;
}
export interface DemoProjectList { readonly demos: ReadonlyArray<DemoProject>; }
export interface DemoSelection { readonly demo: DemoProject; readonly workspace: WorkspaceInfo; }
export interface DemoResetResult { readonly demo: DemoProject; readonly result: string; readonly restored_files: ReadonlyArray<string>; }
export interface PreDemoCheck { readonly name: string; readonly status: string; readonly detail: string; }
export interface PreDemoCheckResult {
  readonly title: string;
  readonly checks: ReadonlyArray<PreDemoCheck>;
  readonly overall: string;
  readonly provider: string;
  readonly model: string;
}
