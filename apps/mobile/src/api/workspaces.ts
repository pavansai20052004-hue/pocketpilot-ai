import type { ProviderHealth, WorkspaceInfo } from '@pocketpilot/shared-types';

import { ApiClient, ApiError } from './client';

export async function getWorkspace(client: ApiClient): Promise<WorkspaceInfo | null> {
  try {
    return await client.request<WorkspaceInfo>('/api/v1/workspaces/current');
  } catch (error) {
    if (error instanceof ApiError && error.status === 404 && error.message === 'No workspace is selected.') return null;
    throw error;
  }
}
export const getProviderHealth = (client: ApiClient): Promise<ProviderHealth> => client.request('/api/v1/analysis/provider');
