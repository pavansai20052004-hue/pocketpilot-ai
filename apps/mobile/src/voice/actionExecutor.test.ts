import { describe, expect, it, vi } from 'vitest';

import { VoiceActionExecutor, type VoiceApplicationActions } from './actionExecutor';

function actions(): VoiceApplicationActions {
  const sync = () => vi.fn(() => ({ success: true, message: 'ok', spoken_response: null }));
  const asyncAction = () => vi.fn(() => Promise.resolve({ success: true, message: 'ok', spoken_response: null }));
  return {
    analyzeError: asyncAction(), approvePatch: asyncAction(), explainFix: sync(), explainRootCause: sync(),
    generatePatch: asyncAction(), rejectPatch: asyncAction(), rollback: asyncAction(), scanError: sync(),
    showError: sync(), showLocation: sync(), showPatch: sync(), showSessionStatus: sync(), showTestResult: sync(),
    tryAnotherFix: asyncAction(),
  };
}

describe('voice action executor', () => {
  it('dispatches only to the closed application-action interface', async () => {
    const app = actions();
    const executor = new VoiceActionExecutor(app);
    await executor.execute('GENERATE_PATCH');
    await executor.execute('APPROVE_PATCH');
    await executor.execute('ROLLBACK');
    expect(app.generatePatch).toHaveBeenCalledOnce();
    expect(app.approvePatch).toHaveBeenCalledOnce();
    expect(app.rollback).toHaveBeenCalledOnce();
  });

  it('does nothing for unknown speech', async () => {
    const app = actions();
    const executor = new VoiceActionExecutor(app);
    const result = await executor.execute('UNKNOWN');
    expect(result.success).toBe(false);
    expect(Object.values(app).every((action) => !vi.mocked(action).mock.calls.length)).toBe(true);
  });

  it('delegates a validated approval to the existing application action', async () => {
    const app = actions();
    const executor = new VoiceActionExecutor(app);
    await executor.execute('APPROVE_PATCH');
    expect(app.approvePatch).toHaveBeenCalledTimes(1);
  });
});
