import { describe, expect, it, vi } from 'vitest';
import { VoiceConfirmation } from './confirmation';

describe('voice confirmation execution boundary', () => {
  it.each(['APPROVE_PATCH', 'ROLLBACK'] as const)('consumes %s only once across button and speech callbacks', async (intent) => {
    const guard = new VoiceConfirmation();
    const execute = vi.fn();
    guard.begin(intent, 'reviewed-session-revision-patch', 100);
    const confirm = async () => {
      const allowed = guard.consume('reviewed-session-revision-patch', 200);
      if (allowed) await execute(allowed);
    };
    await Promise.all([confirm(), confirm(), confirm()]);
    expect(execute).toHaveBeenCalledExactlyOnceWith(intent);
  });

  it('rejects a replaced target and consumes the stale request', () => {
    const guard = new VoiceConfirmation();
    guard.begin('APPROVE_PATCH', 'old-target', 0);
    expect(guard.consume('new-target', 1)).toBeNull();
    expect(guard.consume('old-target', 2)).toBeNull();
  });

  it('expires even if listening changes the UI phase or delays the timer', () => {
    const guard = new VoiceConfirmation();
    guard.begin('APPROVE_PATCH', 'target', 0);
    expect(guard.isPending('target', 29_999)).toBe(true);
    expect(guard.isPending('different-target', 29_999)).toBe(false);
    expect(guard.isPending('target', 30_000)).toBe(false);
    expect(guard.consume('target', 30_000)).toBeNull();
  });

  it('cancellation makes delayed confirmation harmless', () => {
    const guard = new VoiceConfirmation();
    guard.begin('ROLLBACK', 'target', 0);
    guard.clear();
    expect(guard.consume('target', 1)).toBeNull();
  });

  it('requires a patch target and a confirmation-requiring action', () => {
    const guard = new VoiceConfirmation();
    expect(guard.begin('APPROVE_PATCH', null)).toBe(false);
    expect(guard.begin('SHOW_PATCH', 'target')).toBe(false);
    expect(guard.consume('target')).toBeNull();
  });
});
