import type { DebugState, PatchStatus } from '@pocketpilot/shared-types';

export const VOICE_INTENTS = [
  'SCAN_ERROR',
  'ANALYZE_ERROR',
  'EXPLAIN_ROOT_CAUSE',
  'GENERATE_PATCH',
  'SHOW_PATCH',
  'APPROVE_PATCH',
  'REJECT_PATCH',
  'RUN_VALIDATION',
  'EXPLAIN_FIX',
  'TRY_ANOTHER_FIX',
  'ROLLBACK',
  'SHOW_ERROR',
  'SHOW_LOCATION',
  'SHOW_TEST_RESULT',
  'SHOW_SESSION_STATUS',
  'CONFIRM',
  'CANCEL',
  'UNKNOWN',
] as const;

export type VoiceIntent = (typeof VOICE_INTENTS)[number];
export type VoiceIntentConfidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type VoicePermissionState = 'NOT_REQUESTED' | 'GRANTED' | 'DENIED' | 'PERMANENTLY_DENIED';
export type VoiceErrorCode =
  | 'MIC_PERMISSION_DENIED'
  | 'SPEECH_UNAVAILABLE'
  | 'NO_SPEECH'
  | 'NO_MATCH'
  | 'NETWORK_ERROR'
  | 'RECOGNIZER_BUSY'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'UNKNOWN';

export const VOICE_PHASES = [
  'IDLE',
  'REQUESTING_PERMISSION',
  'LISTENING',
  'PROCESSING',
  'TRANSCRIPT_READY',
  'RESOLVING_INTENT',
  'AWAITING_CONFIRMATION',
  'EXECUTING',
  'COMPLETED',
  'FAILED',
] as const;

export type VoicePhase = (typeof VOICE_PHASES)[number];

export interface SpeechCapability {
  readonly available: boolean;
  readonly locale: string;
  readonly offline_requested: boolean;
  readonly offline_supported: boolean;
  readonly offline_verified: boolean;
  readonly provider_name: string | null;
}

export interface SpeechRecognitionResult {
  readonly transcript: string;
  readonly confidence: number | null;
  readonly isFinal: boolean;
  readonly recognition_duration_ms: number;
}

export interface SpeechRecognizerCallbacks {
  readonly onListening: () => void;
  readonly onResult: (result: SpeechRecognitionResult) => void;
  readonly onError: (code: VoiceErrorCode, message: string) => void;
  readonly onEnd: () => void;
}

export interface SpeechRecognizer {
  getCapability(locale: string): Promise<SpeechCapability>;
  getPermission(): Promise<VoicePermissionState>;
  requestPermission(): Promise<VoicePermissionState>;
  start(locale: string, callbacks: SpeechRecognizerCallbacks, options?: { readonly contextualStrings: readonly string[] }): Promise<void>;
  stop(): void;
  cancel(): void;
  dispose(): void;
}

export interface SpeechOutputProvider {
  getAvailable(locale: string): Promise<boolean>;
  speak(text: string, locale: string, onStart?: () => void): Promise<void>;
  stop(): Promise<void>;
}

export interface VoiceIntentResolution {
  readonly intent: VoiceIntent;
  readonly confidence: VoiceIntentConfidence;
  readonly normalized_transcript: string;
  readonly reason: string;
  readonly resolution_ms: number;
}

export interface VoiceSessionContext {
  readonly session_state: DebugState | null;
  readonly patch_status: PatchStatus | null;
  readonly has_error_text: boolean;
  readonly has_analysis: boolean;
  readonly has_patch: boolean;
  readonly retry_count: number;
}

export interface VoiceIntentValidation {
  readonly allowed: boolean;
  readonly reason: string;
  readonly confirmation_required: boolean;
}

export interface VoiceExecutionResult {
  readonly success: boolean;
  readonly message: string;
  readonly spoken_response: string | null;
}

export interface VoiceActionMetrics {
  readonly speech_start_latency_ms: number | null;
  readonly recognition_duration_ms: number | null;
  readonly intent_resolution_ms: number | null;
  readonly action_start_latency_ms: number | null;
  readonly tts_start_latency_ms: number | null;
  readonly total_voice_action_duration_ms: number | null;
}

export interface VoiceHistoryEntry {
  readonly transcript: string;
  readonly intent: VoiceIntent;
  readonly completed_at: string;
}
