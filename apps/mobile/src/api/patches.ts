import type { ActionSource, DebugSession, PatchActionResponse, PatchGenerationResponse, PatchWorkflowView } from '@pocketpilot/shared-types';

import { ApiClient } from './client';

export const LOCAL_PATCH_GENERATION_TIMEOUT_MS = 630_000;
export const PATCH_DECISION_TIMEOUT_MS = 90_000;

export function generatePatch(client: ApiClient, session: DebugSession, actionSource: ActionSource = 'MOBILE_UI'): Promise<PatchGenerationResponse> {
  return client.request(`/api/v1/sessions/${encodeURIComponent(session.id)}/patches/generate`, { method: 'POST', timeoutMs: LOCAL_PATCH_GENERATION_TIMEOUT_MS, body: JSON.stringify({ expected_revision: session.revision, action_source: actionSource }) });
}

export function decidePatch(client: ApiClient, session: DebugSession, patch: PatchWorkflowView, action: 'approve' | 'reject' | 'rollback', actionSource: ActionSource = 'MOBILE_UI'): Promise<PatchActionResponse> {
  return client.request(`/api/v1/sessions/${encodeURIComponent(session.id)}/patches/${encodeURIComponent(patch.proposal.id)}/${action}`, { method: 'POST', timeoutMs: PATCH_DECISION_TIMEOUT_MS, body: JSON.stringify({ expected_revision: session.revision, action_source: actionSource }) });
}

export const getPatch = (client: ApiClient, id: string): Promise<PatchWorkflowView> => client.request(`/api/v1/sessions/${encodeURIComponent(id)}/patches/current`);
