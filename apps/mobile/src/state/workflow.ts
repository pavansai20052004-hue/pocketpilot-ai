import type { AgentEvent, AnalysisRecord, DebugSession, PatchWorkflowView, WorkspaceInfo } from '@pocketpilot/shared-types';
import type { SocketStatus } from '../bridge/PocketPilotSocket';

export interface WorkflowState {
  readonly connection: SocketStatus;
  readonly workspace: WorkspaceInfo | null;
  readonly session: DebugSession | null;
  readonly events: ReadonlyArray<AgentEvent>;
  readonly analysis: AnalysisRecord | null;
  readonly patch: PatchWorkflowView | null;
}

export type WorkflowAction =
  | { readonly type: 'CONNECTION'; readonly status: SocketStatus }
  | { readonly type: 'WORKSPACE'; readonly workspace: WorkspaceInfo | null }
  | { readonly type: 'SESSION'; readonly session: DebugSession }
  | { readonly type: 'EVENT'; readonly event: AgentEvent }
  | { readonly type: 'SNAPSHOT'; readonly session: DebugSession; readonly events: ReadonlyArray<AgentEvent>; readonly patch?: PatchWorkflowView | null }
  | { readonly type: 'ANALYSIS'; readonly analysis: AnalysisRecord }
  | { readonly type: 'PATCH'; readonly patch: PatchWorkflowView }
  | { readonly type: 'RESET' };

export const initialWorkflowState: WorkflowState = { connection: 'DISCONNECTED', workspace: null, session: null, events: [], analysis: null, patch: null };

export function workflowReducer(state: WorkflowState, action: WorkflowAction): WorkflowState {
  switch (action.type) {
    case 'CONNECTION': return { ...state, connection: action.status };
    case 'WORKSPACE': return { ...state, workspace: action.workspace };
    case 'SESSION': return { ...state, session: action.session };
    case 'ANALYSIS': return { ...state, analysis: action.analysis };
    case 'PATCH': return { ...state, patch: action.patch };
    case 'EVENT': {
      if (state.events.some((event) => event.sequence === action.event.sequence)) return state;
      return { ...state, events: [...state.events, action.event].sort((a, b) => a.sequence - b.sequence) };
    }
    case 'SNAPSHOT': {
      const bySequence = new Map(state.events.map((event) => [event.sequence, event]));
      action.events.forEach((event) => bySequence.set(event.sequence, event));
      return { ...state, session: action.session, events: [...bySequence.values()].sort((a, b) => a.sequence - b.sequence), patch: action.patch === undefined ? state.patch : action.patch };
    }
    case 'RESET': return initialWorkflowState;
  }
}

export function pipelineStatus(state: WorkflowState): ReadonlyArray<{ label: string; complete: boolean; active: boolean }> {
  const names = new Set(state.events.map((event) => event.name));
  const sessionState = state.session?.state;
  return [
    { label: 'Error captured', complete: names.has('error_captured'), active: sessionState === 'CAPTURED' },
    { label: 'Parsing', complete: names.has('error_parsed'), active: names.has('analysis_requested') && !names.has('error_parsed') },
    { label: 'Selecting context', complete: names.has('context_collection_completed'), active: names.has('context_collection_started') && !names.has('context_collection_completed') },
    { label: 'Local AI analysis', complete: names.has('root_cause_found'), active: names.has('analysis_provider_started') && !names.has('root_cause_found') },
    { label: 'Root cause', complete: names.has('root_cause_found'), active: sessionState === 'ROOT_CAUSE_FOUND' },
    { label: 'Patch', complete: names.has('patch_applied'), active: ['PATCH_GENERATED', 'AWAITING_APPROVAL', 'PATCH_APPLYING'].includes(sessionState ?? '') },
    { label: 'Verification', complete: sessionState === 'SUCCESS', active: sessionState === 'TESTING' },
  ];
}
