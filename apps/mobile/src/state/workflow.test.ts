import type { AgentEvent, DebugSession } from '@pocketpilot/shared-types';
import { describe, expect, it } from 'vitest';

import { initialWorkflowState, pipelineStatus, workflowReducer } from './workflow';

const baseSession: DebugSession = { id: 'session-1', title: 'Python KeyError', state: 'IDLE', revision: 0, retry_count: 0, created_at: '2026-09-03T00:00:00Z', updated_at: '2026-09-03T00:00:00Z', last_event_sequence: 1 };
function session(state: DebugSession['state'], revision: number): DebugSession { return { ...baseSession, state, revision, last_event_sequence: revision + 1 }; }
function event(sequence: number, name: AgentEvent['name'], state: DebugSession['state']): AgentEvent { return { id: `e-${sequence}`, session_id: baseSession.id, sequence, name, state, summary: name, occurred_at: '2026-09-03T00:00:00Z' }; }

describe('mobile workflow reducer', () => {
  it('tracks the real backend progression through success without duplicate events', () => {
    let state = workflowReducer(initialWorkflowState, { type: 'SESSION', session: session('CAPTURED', 1) });
    const events = [
      event(2, 'error_captured', 'CAPTURED'), event(3, 'analysis_requested', 'ANALYZING'),
      event(4, 'error_parsed', 'ANALYZING'), event(5, 'context_collection_completed', 'ANALYZING'),
      event(6, 'root_cause_found', 'ROOT_CAUSE_FOUND'), event(7, 'patch_awaiting_approval', 'AWAITING_APPROVAL'),
      event(8, 'patch_approved', 'PATCH_APPLYING'), event(9, 'tests_started', 'TESTING'), event(10, 'tests_passed', 'SUCCESS'),
    ];
    for (const item of events) state = workflowReducer(state, { type: 'EVENT', event: item });
    state = workflowReducer(state, { type: 'EVENT', event: events[0] as AgentEvent });
    state = workflowReducer(state, { type: 'SESSION', session: session('SUCCESS', 9) });

    expect(state.events).toHaveLength(events.length);
    expect(state.session?.state).toBe('SUCCESS');
    expect(pipelineStatus(state).find((step) => step.label === 'Verification')?.complete).toBe(true);
  });

  it('reconciles missed snapshot events in sequence order', () => {
    const withLive = workflowReducer(initialWorkflowState, { type: 'EVENT', event: event(3, 'analysis_requested', 'ANALYZING') });
    const reconciled = workflowReducer(withLive, { type: 'SNAPSHOT', session: session('ROOT_CAUSE_FOUND', 4), events: [event(2, 'error_captured', 'CAPTURED'), event(3, 'analysis_requested', 'ANALYZING'), event(5, 'root_cause_found', 'ROOT_CAUSE_FOUND')] });
    expect(reconciled.events.map((item) => item.sequence)).toEqual([2, 3, 5]);
  });
});
