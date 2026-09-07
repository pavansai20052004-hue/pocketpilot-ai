import { describe, expect, it } from 'vitest';

import { initialVoiceState, voiceReducer } from './state';

describe('voice state machine', () => {
  it('moves through listening, transcript, confirmation, execution, and completion', () => {
    let state = voiceReducer(initialVoiceState, { type: 'PERMISSION', permission: 'GRANTED' });
    state = voiceReducer(state, { type: 'START', at: 100 });
    state = voiceReducer(state, { type: 'LISTENING', at: 112 });
    state = voiceReducer(state, { type: 'FINAL_RESULT', transcript: 'approve fix', confidence: null, duration: 500 });
    const resolution = { intent: 'APPROVE_PATCH' as const, confidence: 'HIGH' as const, normalized_transcript: 'approve fix', reason: 'match', resolution_ms: 1 };
    const validation = { allowed: true, reason: 'confirm', confirmation_required: true };
    state = voiceReducer(state, { type: 'RESOLVED', resolution, validation });
    state = voiceReducer(state, { type: 'AWAIT_CONFIRMATION', resolution, message: 'Confirm?' });
    expect(state.phase).toBe('AWAITING_CONFIRMATION');
    state = voiceReducer(state, { type: 'EXECUTING', at: 650 });
    state = voiceReducer(state, { type: 'COMPLETED', result: { success: true, message: 'Applied', spoken_response: 'Verified' }, at: 900 });
    expect(state.phase).toBe('COMPLETED');
    expect(state.metrics).toEqual(expect.objectContaining({ speech_start_latency_ms: 12, recognition_duration_ms: 500, total_voice_action_duration_ms: 800 }));
  });

  it('clears pending confirmation on failure', () => {
    const failed = voiceReducer(initialVoiceState, { type: 'FAILED', message: 'Stale revision', at: 50 });
    expect(failed.phase).toBe('FAILED');
    expect(failed.pending_confirmation).toBeNull();
  });
});
