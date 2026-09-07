import type {
  VoiceActionMetrics,
  VoiceExecutionResult,
  VoiceIntentResolution,
  VoiceIntentValidation,
  VoicePermissionState,
  VoicePhase,
} from './contracts';

export interface VoiceState {
  readonly phase: VoicePhase;
  readonly permission: VoicePermissionState;
  readonly transcript: string;
  readonly transcript_confidence: number | null;
  readonly resolution: VoiceIntentResolution | null;
  readonly validation: VoiceIntentValidation | null;
  readonly pending_confirmation: VoiceIntentResolution | null;
  readonly message: string | null;
  readonly metrics: VoiceActionMetrics;
  readonly started_at_ms: number | null;
}

const emptyMetrics: VoiceActionMetrics = {
  speech_start_latency_ms: null,
  recognition_duration_ms: null,
  intent_resolution_ms: null,
  action_start_latency_ms: null,
  tts_start_latency_ms: null,
  total_voice_action_duration_ms: null,
};

export const initialVoiceState: VoiceState = {
  phase: 'IDLE', permission: 'NOT_REQUESTED', transcript: '', transcript_confidence: null,
  resolution: null, validation: null, pending_confirmation: null, message: null, metrics: emptyMetrics, started_at_ms: null,
};

export type VoiceStateAction =
  | { readonly type: 'PERMISSION'; readonly permission: VoicePermissionState }
  | { readonly type: 'REQUEST_PERMISSION' }
  | { readonly type: 'START'; readonly at: number; readonly forConfirmation?: boolean }
  | { readonly type: 'LISTENING'; readonly at: number }
  | { readonly type: 'PARTIAL_RESULT'; readonly transcript: string; readonly confidence: number | null }
  | { readonly type: 'FINAL_RESULT'; readonly transcript: string; readonly confidence: number | null; readonly duration: number }
  | { readonly type: 'RESOLVED'; readonly resolution: VoiceIntentResolution; readonly validation: VoiceIntentValidation }
  | { readonly type: 'AWAIT_CONFIRMATION'; readonly resolution: VoiceIntentResolution; readonly message: string }
  | { readonly type: 'EXECUTING'; readonly at: number }
  | { readonly type: 'COMPLETED'; readonly result: VoiceExecutionResult; readonly at: number }
  | { readonly type: 'TTS_STARTED'; readonly at: number }
  | { readonly type: 'FAILED'; readonly message: string; readonly at: number }
  | { readonly type: 'RESET' };

export function voiceReducer(state: VoiceState, action: VoiceStateAction): VoiceState {
  switch (action.type) {
    case 'PERMISSION': return { ...state, permission: action.permission };
    case 'REQUEST_PERMISSION': return { ...state, phase: 'REQUESTING_PERMISSION', message: null };
    case 'START': return {
      ...initialVoiceState, permission: state.permission, phase: 'PROCESSING', started_at_ms: action.at,
      ...(action.forConfirmation ? { resolution: state.resolution, validation: state.validation, pending_confirmation: state.pending_confirmation, message: state.message } : {}),
    };
    case 'LISTENING': return { ...state, phase: 'LISTENING', metrics: { ...state.metrics, speech_start_latency_ms: elapsed(state.started_at_ms, action.at) } };
    case 'PARTIAL_RESULT': return { ...state, transcript: action.transcript, transcript_confidence: action.confidence };
    case 'FINAL_RESULT': return { ...state, phase: 'TRANSCRIPT_READY', transcript: action.transcript, transcript_confidence: action.confidence, metrics: { ...state.metrics, recognition_duration_ms: action.duration } };
    case 'RESOLVED': return { ...state, phase: 'RESOLVING_INTENT', resolution: action.resolution, validation: action.validation, metrics: { ...state.metrics, intent_resolution_ms: action.resolution.resolution_ms } };
    case 'AWAIT_CONFIRMATION': return { ...state, phase: 'AWAITING_CONFIRMATION', resolution: action.resolution, pending_confirmation: action.resolution, message: action.message };
    case 'EXECUTING': return { ...state, phase: 'EXECUTING', pending_confirmation: null, metrics: { ...state.metrics, action_start_latency_ms: elapsed(state.started_at_ms, action.at) } };
    case 'COMPLETED': return { ...state, phase: action.result.success ? 'COMPLETED' : 'FAILED', message: action.result.message, pending_confirmation: null, metrics: { ...state.metrics, total_voice_action_duration_ms: elapsed(state.started_at_ms, action.at) } };
    case 'TTS_STARTED': return { ...state, metrics: { ...state.metrics, tts_start_latency_ms: elapsed(state.started_at_ms, action.at) } };
    case 'FAILED': return { ...state, phase: 'FAILED', message: action.message, pending_confirmation: null, metrics: { ...state.metrics, total_voice_action_duration_ms: elapsed(state.started_at_ms, action.at) } };
    case 'RESET': return { ...initialVoiceState, permission: state.permission };
  }
}

function elapsed(started: number | null, ended: number): number | null {
  return started === null ? null : Math.max(0, ended - started);
}
