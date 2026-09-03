import type { ProviderHealth, WorkspaceInfo } from '@pocketpilot/shared-types';

import { ApiClient } from './client';

export const getWorkspace = (client: ApiClient): Promise<WorkspaceInfo> => client.request('/api/v1/workspaces/current');
export const getProviderHealth = (client: ApiClient): Promise<ProviderHealth> => client.request('/api/v1/analysis/provider');
