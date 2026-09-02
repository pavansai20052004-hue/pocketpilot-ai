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
