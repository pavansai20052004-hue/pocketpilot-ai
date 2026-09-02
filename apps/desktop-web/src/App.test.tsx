import { describe, expect, it } from 'vitest';

import { AGENT_EVENT_NAMES, DEBUG_STATES } from '@pocketpilot/shared-types';

import { formatBytes } from './App';

describe('foundation contracts', () => {
  it('exposes stable workflow states and event names to the dashboard', () => {
    expect(DEBUG_STATES).toContain('AWAITING_APPROVAL');
    expect(AGENT_EVENT_NAMES).toContain('patch_approved');
  });

  it('formats repository metadata sizes for the dashboard', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB');
  });
});
