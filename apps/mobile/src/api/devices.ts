import type { PairDeviceResponse } from '@pocketpilot/shared-types';

import { ApiClient, ApiError } from './client';

export async function pairDevice(client: ApiClient, code: string, displayName: string): Promise<PairDeviceResponse> {
  const value = await client.request<unknown>('/api/v1/devices/pair', {
    method: 'POST',
    authenticated: false,
    body: JSON.stringify({ code: code.replace(/\s/g, ''), display_name: displayName.trim() }),
  });
  return parsePairDeviceResponse(value);
}

export function parsePairDeviceResponse(value: unknown): PairDeviceResponse {
  if (
    typeof value !== 'object' || value === null
    || !('token' in value) || typeof value.token !== 'string' || value.token.length < 20
    || !('device' in value) || typeof value.device !== 'object' || value.device === null
    || !('device_id' in value.device) || typeof value.device.device_id !== 'string'
    || !('display_name' in value.device) || typeof value.device.display_name !== 'string'
    || !('permissions' in value.device) || !Array.isArray(value.device.permissions)
  ) {
    throw new ApiError('The laptop returned an invalid pairing response.', null, false);
  }
  return value as PairDeviceResponse;
}
