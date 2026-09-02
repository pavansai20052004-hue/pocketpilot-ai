import { describe, expect, it } from 'vitest';

import { AGENT_EVENT_NAMES, DEBUG_STATES } from '@pocketpilot/shared-types';

describe('foundation contracts', () => {
  it('exposes stable workflow states and event names to the dashboard', () => {
    expect(DEBUG_STATES).toContain('AWAITING_APPROVAL');
    expect(AGENT_EVENT_NAMES).toContain('patch_approved');
  });
});
