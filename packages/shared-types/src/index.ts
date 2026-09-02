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
  'root_cause_found',
  'patch_generated',
  'approval_requested',
  'patch_approved',
  'patch_applied',
  'tests_started',
  'tests_passed',
  'tests_failed',
  'session_failed',
  'retry_started',
  'rollback_completed',
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

export type SessionWebSocketMessage =
  | {
      readonly type: 'snapshot';
      readonly session: DebugSession;
      readonly events: ReadonlyArray<AgentEvent>;
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
