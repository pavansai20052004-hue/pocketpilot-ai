import type { AnalysisRecord, PatchWorkflowView } from '@pocketpilot/shared-types';
import { describe, expect, it } from 'vitest';

import { formatFixResponse, formatRootCauseResponse } from './responseFormatter';

describe('voice response formatter', () => {
  it('speaks bounded structured root-cause data', () => {
    const analysis = { result: { summary: 'A nullable user was dereferenced', repair_strategy: 'Add a fallback before reading name.', likely_file: 'user_service.py', likely_line: 5 } } as AnalysisRecord;
    const response = formatRootCauseResponse({ analysis, patch: null, session: null });
    expect(response).toContain('user_service.py line 5');
    expect(response.length).toBeLessThanOrEqual(360);
  });

  it('uses patch and real validation state rather than inventing test counts', () => {
    const patch = { proposal: { summary: 'PocketPilot added a null fallback.' }, validation: { files_changed: 1 }, test_result: { passed: true } } as PatchWorkflowView;
    expect(formatFixResponse({ analysis: null, patch, session: null })).toBe('PocketPilot added a null fallback. It changes 1 file. The fix was verified by the approved tests.');
  });
});
