import { describe, expect, it } from 'vitest';

import {
  AGENT_EVENT_NAMES,
  COMMAND_STATUSES,
  DEBUG_STATES,
  type SafeCommand,
  type SystemStatus,
} from './index.js';

describe('shared contracts', () => {
  it('keeps the approval gate in the workflow vocabulary', () => {
    expect(DEBUG_STATES.indexOf('AWAITING_APPROVAL')).toBeGreaterThan(
      DEBUG_STATES.indexOf('PATCH_GENERATED'),
    );
    expect(DEBUG_STATES.indexOf('PATCH_APPLYING')).toBeGreaterThan(
      DEBUG_STATES.indexOf('AWAITING_APPROVAL'),
    );
  });

  it('publishes the required observability events without duplicates', () => {
    expect(new Set(AGENT_EVENT_NAMES).size).toBe(AGENT_EVENT_NAMES.length);
    expect(AGENT_EVENT_NAMES).toContain('tests_passed');
  });

  it('accepts a typed system status', () => {
    const status: SystemStatus = {
      service: 'PocketPilot Agent',
      version: '0.1.0',
      environment: 'test',
      components: {
        api: 'ready',
        workspace: 'not_configured',
        model: 'not_configured',
      },
    };

    expect(status.components.api).toBe('ready');
  });

  it('keeps command execution states explicit', () => {
    expect(COMMAND_STATUSES).toContain('TIMED_OUT');
    expect(COMMAND_STATUSES).toContain('NOT_AVAILABLE');
  });

  it('represents command arguments separately from display text', () => {
    const command: SafeCommand = {
      id: 'npm-test',
      label: 'Run tests',
      category: 'test',
      executable: 'npm',
      args: ['run', 'test'],
      display_command: 'npm run test',
      working_directory: '.',
      evidence: "safe 'test' script in package.json",
    };
    expect(command.args).toEqual(['run', 'test']);
  });
});
