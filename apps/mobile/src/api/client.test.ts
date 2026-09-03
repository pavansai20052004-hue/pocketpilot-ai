import { describe, expect, it, vi } from 'vitest';

import { ApiClient, normalizeBaseUrl, type Fetcher } from './client';
import { pairDevice, parsePairDeviceResponse } from './devices';
import { analyzeText } from './analysis';

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('mobile API client', () => {
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
});
