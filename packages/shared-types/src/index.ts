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
  'image_received',
  'ocr_completed',
  'analysis_started',
  'root_cause_found',
  'patch_generated',
  'patch_approved',
  'patch_applied',
  'tests_started',
  'tests_passed',
  'tests_failed',
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

export interface AgentEvent<TPayload = Readonly<Record<string, unknown>>> {
  readonly id: string;
  readonly sessionId: string;
  readonly name: AgentEventName;
  readonly state: DebugState;
  readonly occurredAt: string;
  readonly payload: TPayload;
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
