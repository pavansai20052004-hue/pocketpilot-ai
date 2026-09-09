import { describe, expect, it } from 'vitest';

import type { DebugSession } from '@pocketpilot/shared-types';

import { resolveWorkPhase, workPhaseContent, type WorkPhase } from './workProgress';

function session(state: DebugSession['state']): DebugSession {
  return { id: 'session-1', title: 'Issue', state, revision: 1, retry_count: 0, created_at: '2026-09-09T00:00:00Z', updated_at: '2026-09-09T00:00:00Z', last_event_sequence: 1 };
}

describe('work progress', () => {
  it('maps request and durable workflow states to the truthful phase', () => {
    expect(resolveWorkPhase('analyze', null)).toBe('ANALYZE');
    expect(resolveWorkPhase('retry', session('ROOT_CAUSE_FOUND'))).toBe('ANALYZE');
    expect(resolveWorkPhase('patch', session('ROOT_CAUSE_FOUND'))).toBe('GENERATE');
    expect(resolveWorkPhase('approve', session('AWAITING_APPROVAL'))).toBe('APPLY');
    expect(resolveWorkPhase('approve', session('TESTING'))).toBe('TEST');
    expect(resolveWorkPhase(null, session('PATCH_APPLYING'))).toBe('APPLY');
    expect(resolveWorkPhase(null, session('SUCCESS'))).toBeNull();
  });

  it('provides honest indeterminate progress copy for every long-running phase', () => {
    for (const phase of ['ANALYZE', 'GENERATE', 'APPLY', 'TEST'] as const satisfies ReadonlyArray<WorkPhase>) {
      const content = workPhaseContent(phase);
      expect(content.title).not.toHaveLength(0);
      expect(content.messages.length).toBeGreaterThanOrEqual(3);
      expect(`${content.title} ${content.messages.join(' ')} ${content.footer}`).not.toContain('%');
    }
  });
});
