import { describe, expect, it, vi } from 'vitest';

import { ApiClient, normalizeBaseUrl, type Fetcher } from './client';
import { pairDevice, parsePairDeviceResponse } from './devices';
import { analyzeText, LOCAL_ANALYSIS_TIMEOUT_MS } from './analysis';
import { decidePatch, generatePatch, LOCAL_PATCH_GENERATION_TIMEOUT_MS, PATCH_DECISION_TIMEOUT_MS } from './patches';
import { getWorkspace } from './workspaces';

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('mobile API client', () => {
  it('treats an unselected workspace as an empty state and recovers after laptop selection', async () => {
    const workspace = { id: 'workspace-demo', name: 'python-broken-app' };
    const fetcher = vi.fn<Fetcher>()
      .mockResolvedValueOnce(jsonResponse({ detail: 'No workspace is selected.' }, 404))
      .mockResolvedValueOnce(jsonResponse(workspace));
    const client = new ApiClient({ baseUrl: 'http://laptop:8000', token: 'token', fetcher });
    await expect(getWorkspace(client)).resolves.toBeNull();
    await expect(getWorkspace(client)).resolves.toEqual(workspace);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403, 500])('does not hide workspace request failure %s', async (status) => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(jsonResponse({ detail: 'Request failed.' }, status));
    const client = new ApiClient({ baseUrl: 'http://laptop:8000', token: 'token', fetcher });
    await expect(getWorkspace(client)).rejects.toMatchObject({ status });
  });

  it('normalizes a manual laptop address', () => {
    expect(normalizeBaseUrl('192.168.1.23:8000/')).toBe('http://192.168.1.23:8000');
  });

  it('pairs without auth and parses the typed result', async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(jsonResponse({ device: { device_id: 'device-1', display_name: 'Pavan iQOO', permissions: ['READ_SESSION'] }, token: 'long-enough-device-token-value' }));
    const result = await pairDevice(new ApiClient({ baseUrl: '192.168.1.23:8000', fetcher }), '482 917', 'Pavan iQOO');

    expect(result.token).toBe('long-enough-device-token-value');
    expect(fetcher).toHaveBeenCalledWith('http://192.168.1.23:8000/api/v1/devices/pair', expect.objectContaining({ method: 'POST' }));
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as { code: string };
    expect(body.code).toBe('482917');
  });

  it('rejects a structurally invalid typed pairing result', () => {
    expect(() => parsePairDeviceResponse({ token: 'short', device: {} })).toThrow('invalid pairing response');
  });

  it('adds bearer auth and surfaces a non-retryable 401', async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(jsonResponse({ detail: 'Device token expired.' }, 401));
    const client = new ApiClient({ baseUrl: 'http://laptop:8000', token: 'token', fetcher });

    await expect(client.request('/api/v1/sessions')).rejects.toMatchObject({ status: 401, retryable: false });
    const headers = fetcher.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer token');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('retries one transient network failure', async () => {
    const fetcher = vi.fn<Fetcher>()
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const client = new ApiClient({ baseUrl: 'http://laptop:8000', token: 'token', fetcher });

    await expect(client.request<{ ok: boolean }>('/api/v1/sessions')).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non-retryable response', async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(jsonResponse({ detail: 'Conflict' }, 409));
    const client = new ApiClient({ baseUrl: 'http://laptop:8000', token: 'token', fetcher });

    await expect(client.request('/api/v1/sessions')).rejects.toMatchObject({ status: 409, retryable: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('preserves confirmed camera OCR provenance and sends text rather than an image', async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(jsonResponse({ session: {}, analysis: {} }));
    const client = new ApiClient({ baseUrl: 'http://laptop:8000', token: 'token', fetcher });
    const session = { id: 'session-1', revision: 1 } as Parameters<typeof analyzeText>[1];
    await analyzeText(client, session, 'TypeError: boom', 'TypeScript', 'CAMERA');

    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ input_type: 'CAMERA', raw_text: 'TypeError: boom' });
    expect(JSON.stringify(body)).not.toContain('image');
    expect(JSON.stringify(body)).not.toContain('file:///');
  });

  it('marks voice-triggered application actions without changing their safe API route', async () => {
    const fetcher = vi.fn<Fetcher>().mockResolvedValue(jsonResponse({ session: {}, workflow: {} }));
    const client = new ApiClient({ baseUrl: 'http://laptop:8000', token: 'token', fetcher });
    const session = { id: 'session-1', revision: 4 } as Parameters<typeof generatePatch>[1];
    const patch = { proposal: { id: 'patch-1' } } as Parameters<typeof decidePatch>[2];
    await generatePatch(client, session, 'VOICE');
    await decidePatch(client, session, patch, 'approve', 'VOICE');

    const generated = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    const approved = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body)) as Record<string, unknown>;
    expect(generated).toEqual({ expected_revision: 4, action_source: 'VOICE' });
    expect(approved).toEqual({ expected_revision: 4, action_source: 'VOICE' });
    expect(fetcher.mock.calls[1]?.[0]).toContain('/patches/patch-1/approve');
  });

  it('gives real local-model operations explicit time budgets beyond the fast API default', async () => {
    const fetcher = vi.fn<Fetcher>().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return jsonResponse({ session: {}, analysis: {}, workflow: {} });
    });
    const client = new ApiClient({ baseUrl: 'http://laptop:8000', token: 'token', timeoutMs: 1, fetcher });
    const session = { id: 'session-1', revision: 4 } as Parameters<typeof generatePatch>[1];
    const patch = { proposal: { id: 'patch-1' } } as Parameters<typeof decidePatch>[2];

    await expect(analyzeText(client, session, 'TypeError: boom')).resolves.toBeDefined();
    await expect(generatePatch(client, session)).resolves.toBeDefined();
    await expect(decidePatch(client, session, patch, 'approve')).resolves.toBeDefined();

    expect(LOCAL_ANALYSIS_TIMEOUT_MS).toBeGreaterThanOrEqual(300_000);
    expect(LOCAL_PATCH_GENERATION_TIMEOUT_MS).toBeGreaterThanOrEqual(600_000);
    expect(PATCH_DECISION_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000);
  });
});
