import { expect, it } from 'vitest';
import { voiceCommandHints } from './commandHints';
import type { VoiceSessionContext } from './contracts';

const context: VoiceSessionContext = { session_state: null, patch_status: null, has_analysis: false, has_patch: false, has_error_text: false, retry_count: 0 };

it('does not suggest approval when no patch exists, or mix commands into confirmation', () => {
  expect(voiceCommandHints(context, false)).not.toContain('approve fix');
  const hints = voiceCommandHints({ ...context, session_state: 'AWAITING_APPROVAL', has_patch: true, patch_status: 'AWAITING_APPROVAL' }, false);
  expect(hints).toContain('approve fix');
  const answers = voiceCommandHints(context, true);
  expect(answers).toContain('yes');
  expect(answers).toContain('cancel');
  expect(answers).not.toContain('approve fix');
  expect(answers).not.toContain('scan an error');
});
