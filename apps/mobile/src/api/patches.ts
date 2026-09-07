import type { ActionSource, DebugSession, PatchActionResponse, PatchGenerationResponse, PatchWorkflowView } from '@pocketpilot/shared-types';

import { ApiClient } from './client';

export function generatePatch(client: ApiClient, session: DebugSession, actionSource: ActionSource = 'MOBILE_UI'): Promise<PatchGenerationResponse> {
  return client.request(`/api/v1/sessions/${encodeURIComponent(session.id)}/patches/generate`, { method: 'POST', body: JSON.stringify({ expected_revision: session.revision, action_source: actionSource }) });
}

export function decidePatch(client: ApiClient, session: DebugSession, patch: PatchWorkflowView, action: 'approve' | 'reject' | 'rollback', actionSource: ActionSource = 'MOBILE_UI'): Promise<PatchActionResponse> {
  return client.request(`/api/v1/sessions/${encodeURIComponent(session.id)}/patches/${encodeURIComponent(patch.proposal.id)}/${action}`, { method: 'POST', body: JSON.stringify({ expected_revision: session.revision, action_source: actionSource }) });
}

export const getPatch = (client: ApiClient, id: string): Promise<PatchWorkflowView> => client.request(`/api/v1/sessions/${encodeURIComponent(id)}/patches/current`);
