import { DEBUG_STATES, type PatchStatus } from '@pocketpilot/shared-types';
import { describe, expect, it } from 'vitest';

import type { VoiceSessionContext } from './contracts';
import { validateVoiceIntent } from './intentValidator';

function context(overrides: Partial<VoiceSessionContext> = {}): VoiceSessionContext {
  return { session_state: null, patch_status: null, has_error_text: false, has_analysis: false, has_patch: false, retry_count: 0, ...overrides };
}

describe('state-aware voice intent validation', () => {
  it('requires reviewed input before analysis and root cause before patch generation', () => {
    expect(validateVoiceIntent('ANALYZE_ERROR', context()).allowed).toBe(false);
    expect(validateVoiceIntent('ANALYZE_ERROR', context({ has_error_text: true })).allowed).toBe(true);
    expect(validateVoiceIntent('GENERATE_PATCH', context({ session_state: 'CAPTURED' })).allowed).toBe(false);
    expect(validateVoiceIntent('GENERATE_PATCH', context({ session_state: 'ROOT_CAUSE_FOUND', has_analysis: true })).allowed).toBe(true);
  });

  it('requires confirmation only when a current patch can be applied', () => {
    const noPatch = validateVoiceIntent('APPROVE_PATCH', context({ session_state: 'AWAITING_APPROVAL' }));
    expect(noPatch.allowed).toBe(false);
    const ready = validateVoiceIntent('APPROVE_PATCH', context({ session_state: 'AWAITING_APPROVAL', has_patch: true, patch_status: 'AWAITING_APPROVAL' }));
    expect(ready).toEqual(expect.objectContaining({ allowed: true, confirmation_required: true }));
  });

  it.each<[PatchStatus | null, boolean]>([['VERIFIED', true], ['APPLIED', false], ['ROLLED_BACK', false], [null, false]])('guards rollback for patch status %s', (patchStatus, expected) => {
    const result = validateVoiceIntent('ROLLBACK', context({ session_state: 'SUCCESS', has_patch: patchStatus !== null, patch_status: patchStatus }));
    expect(result.allowed).toBe(expected);
    expect(result.confirmation_required).toBe(expected);
  });

  it('never exposes a standalone command runner', () => {
    const result = validateVoiceIntent('RUN_VALIDATION', context({ session_state: 'ROOT_CAUSE_FOUND', has_analysis: true }));
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('approved patch workflow');
  });

  it('checks approval and rollback consistently across every backend state', () => {
    for (const state of DEBUG_STATES) {
      const approval = validateVoiceIntent('APPROVE_PATCH', context({ session_state: state, has_patch: true, patch_status: 'AWAITING_APPROVAL' }));
      const rollback = validateVoiceIntent('ROLLBACK', context({ session_state: state, has_patch: true, patch_status: 'VERIFIED' }));
      expect(approval.allowed).toBe(state === 'AWAITING_APPROVAL');
      expect(rollback.allowed).toBe(state === 'SUCCESS');
    }
  });
});
