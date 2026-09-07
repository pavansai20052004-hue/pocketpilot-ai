import type { DemoProject, DemoProjectList, DemoResetResult, DemoSelection, PrepareDemoResult, PreDemoCheckResult } from '@pocketpilot/shared-types';

import { ApiClient } from './client';

export const listDemos = (client: ApiClient): Promise<DemoProjectList> =>
  client.request('/api/v1/demo/projects');

export const selectDemo = (client: ApiClient, demoId: string): Promise<DemoSelection> =>
  client.request(`/api/v1/demo/select/${encodeURIComponent(demoId)}`, { method: 'POST' });

export const verifyDemo = (client: ApiClient, demoId: string): Promise<DemoProject> =>
  client.request(`/api/v1/demo/verify/${encodeURIComponent(demoId)}`, { method: 'POST' });

export const resetDemo = (client: ApiClient, demoId: string): Promise<DemoResetResult> =>
  client.request(`/api/v1/demo/reset/${encodeURIComponent(demoId)}`, { method: 'POST' });

export const prepareDemo = (client: ApiClient, demoId: string): Promise<PrepareDemoResult> =>
  client.request(`/api/v1/demo/prepare/${encodeURIComponent(demoId)}`, { method: 'POST' });

export const getDemoReadiness = (client: ApiClient): Promise<PreDemoCheckResult> =>
  client.request('/api/v1/demo/preflight');
