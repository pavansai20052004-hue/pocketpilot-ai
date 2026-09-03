import type { DebugSession, SessionEventList, SessionList, SessionTransitionResult } from '@pocketpilot/shared-types';

import { ApiClient } from './client';

export function createSession(client: ApiClient, title: string): Promise<SessionTransitionResult> {
  return client.request('/api/v1/sessions', { method: 'POST', body: JSON.stringify({ title }) });
}

export function captureSession(client: ApiClient, session: DebugSession): Promise<SessionTransitionResult> {
  return client.request(`/api/v1/sessions/${encodeURIComponent(session.id)}/transitions`, {
    method: 'POST',
    body: JSON.stringify({ target_state: 'CAPTURED', expected_revision: session.revision, summary: 'Error text captured from paired phone.' }),
  });
}

export const getSession = (client: ApiClient, id: string): Promise<DebugSession> => client.request(`/api/v1/sessions/${encodeURIComponent(id)}`);
export const listSessions = (client: ApiClient): Promise<SessionList> => client.request('/api/v1/sessions?limit=30');
export const getEvents = (client: ApiClient, id: string, after = 0): Promise<SessionEventList> => client.request(`/api/v1/sessions/${encodeURIComponent(id)}/events?after_sequence=${after}`);
