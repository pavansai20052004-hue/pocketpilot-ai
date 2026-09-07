import { describe, expect, it, vi } from 'vitest';

import { ApiClient, type Fetcher } from './client';
import { resetDemo, selectDemo } from './demos';

describe('registered demo API', () => {
  it('sends only an encoded demo ID and no filesystem path body', async () => {
    const fetcher = vi.fn<Fetcher>(async () => new Response(JSON.stringify({
      demo: { id: 'python-null-user', name: 'Python', language: 'Python', framework: 'pytest', expected_error_type: 'TypeError', expected_file: 'user_service.py', critical_ocr_tokens: [], status: 'READY', detail: 'ready', validation_duration_ms: 1 },
      workspace: { id: 'w', root_path: 'server-owned', name: 'python-broken-app', exists: true, readable: true, project_types: [], languages: [], frameworks: [], build_systems: [], package_managers: [], file_count: 1, relevant_file_count: 1, total_size: 1, git_detected: false, git_branch: null, detected_commands: [], scan_truncated: false, scan_duration_ms: 1 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const client = new ApiClient({ baseUrl: 'http://laptop:8000', token: 'token', fetcher });

    await selectDemo(client, 'python-null-user');

    expect(fetcher).toHaveBeenCalledWith(
      'http://laptop:8000/api/v1/demo/select/python-null-user',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetcher.mock.calls[0]?.[1]?.body).toBeUndefined();
  });

  it('percent-encodes path-like reset input for server-side rejection', async () => {
    const fetcher = vi.fn<Fetcher>(async () => new Response(JSON.stringify({ detail: 'Demo ID is not registered.' }), { status: 404, headers: { 'Content-Type': 'application/json' } }));
    const client = new ApiClient({ baseUrl: 'http://laptop:8000', token: 'token', fetcher });

    await expect(resetDemo(client, '../outside')).rejects.toThrow('Demo ID is not registered.');
    expect(fetcher.mock.calls[0]?.[0]).toContain('..%2Foutside');
  });
});
