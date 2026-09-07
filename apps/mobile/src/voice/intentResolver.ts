import type { DebugState } from '@pocketpilot/shared-types';

import type { VoiceIntent, VoiceIntentResolution } from './contracts';

const DANGEROUS_PATTERNS = [
  /\b(delete|erase|format)\b.*\b(project|file|drive|system32)\b/,
  /\b(run|execute|open|launch)\b.*\b(shell|terminal|powershell|cmd|bash|curl)\b/,
  /\brm\s+(dash\s+)?r(f|f\b)/,
  /\bgit\s+reset\s+(dash\s+)?hard\b/,
  /\bnpm\s+publish\b/,
  /\bcurl\b/,
  /\bignore\b.*\b(previous|instructions?)\b/,
];

export const EXACT_ALIASES: ReadonlyArray<readonly [VoiceIntent, ReadonlyArray<string>]> = [
  ['SCAN_ERROR', ['scan an error', 'scan error', 'scan the error', 'open camera', 'open the camera', 'open scanner', 'take a picture']],
  ['ANALYZE_ERROR', [
    'analyze this error', 'analyze the error', 'analyze error', 'analyze this', 'analyze it',
    'analyse this error', 'analyse the error', 'analyse error', 'analyse this', 'analyse it',
    'check this error',
  ]],
  ['GENERATE_PATCH', ['fix this', 'generate a fix', 'generate fix', 'create a patch', 'make a patch']],
  ['SHOW_PATCH', ['show patch', 'show the patch', 'show me the patch', 'view diff', 'show diff']],
  ['APPROVE_PATCH', ['approve', 'approve fix', 'approve this fix', 'apply it', 'apply fix']],
  ['REJECT_PATCH', ['reject', 'reject this', 'reject fix', 'discard patch']],
  ['RUN_VALIDATION', ['run tests', 'run the tests', 'validate fix', 'test the fix']],
  ['TRY_ANOTHER_FIX', ['try again', 'try another solution', 'try another fix']],
  ['ROLLBACK', ['undo', 'undo fix', 'undo the fix', 'roll back', 'rollback', 'restore files']],
  ['EXPLAIN_ROOT_CAUSE', ['what happened', 'explain error', 'explain the problem', 'why did it fail', 'what was wrong']],
  ['EXPLAIN_FIX', ['explain fix', 'explain the fix', 'why does this work', 'what changed']],
  ['SHOW_LOCATION', ['where is the bug', 'what file caused the error', 'show location', 'which file']],
  ['SHOW_ERROR', ['show error', 'show the error']],
  ['SHOW_TEST_RESULT', ['show test result', 'show test results', 'did tests pass', 'did the tests pass']],
  ['SHOW_SESSION_STATUS', ['session status', 'section status', 'show session status', 'what is the status']],
  ['CONFIRM', ['yes', 'yes approve', 'confirm', 'confirm it', 'go ahead']],
  ['CANCEL', ['no', 'cancel', 'stop', 'never mind', 'do not']],
];

export function normalizeVoiceTranscript(transcript: string): string {
  return transcript
    .toLocaleLowerCase('en')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function resolveVoiceIntent(transcript: string, sessionState: DebugState | null): VoiceIntentResolution {
  const started = performance.now();
  const normalized = normalizeVoiceTranscript(transcript);
  const result = (intent: VoiceIntent, confidence: VoiceIntentResolution['confidence'], reason: string): VoiceIntentResolution => ({
    intent,
    confidence,
    normalized_transcript: normalized,
    reason,
    resolution_ms: Math.max(0, Math.round(performance.now() - started)),
  });

  if (!normalized) return result('UNKNOWN', 'LOW', 'No speech was recognized.');
  if (DANGEROUS_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return result('UNKNOWN', 'HIGH', 'Shell, filesystem, publishing, and instruction-override commands are unsupported.');
  }

  for (const [intent, aliases] of EXACT_ALIASES) {
    if (aliases.includes(normalized)) return result(intent, 'HIGH', `Matched the supported ${intent} command.`);
  }

  // Observed on the physical en-IN device: the initial /s/ in "scan" was lost.
  // Only this full phrase is recovered; it opens the scanner without capturing.
  if (normalized === 'can an error') {
    return result('SCAN_ERROR', 'MEDIUM', 'Interpreted the observed “can an error” transcription as “scan an error”. Capture remains manual.');
  }

  if (['explain this', 'tell me about this'].includes(normalized)) {
    return ['SUCCESS', 'ROLLED_BACK'].includes(sessionState ?? '')
      ? result('EXPLAIN_FIX', 'MEDIUM', 'Resolved “this” from the completed-fix context.')
      : result('EXPLAIN_ROOT_CAUSE', 'MEDIUM', 'Resolved “this” from the active analysis context.');
  }
  if (['show me this', 'show this'].includes(normalized) && ['PATCH_GENERATED', 'AWAITING_APPROVAL'].includes(sessionState ?? '')) {
    return result('SHOW_PATCH', 'MEDIUM', 'Resolved “this” from the patch-review context.');
  }
  if (normalized === 'check this') {
    return sessionState === null || sessionState === 'IDLE'
      ? result('ANALYZE_ERROR', 'MEDIUM', 'Resolved “check” from the unsubmitted-error context.')
      : result('SHOW_SESSION_STATUS', 'LOW', 'Resolved “check” from the active-session context.');
  }

  return result('UNKNOWN', 'LOW', 'The transcript did not match the closed command vocabulary.');
}

export function resolveConfirmation(transcript: string): 'CONFIRM' | 'CANCEL' | 'UNKNOWN' {
  const normalized = normalizeVoiceTranscript(transcript);
  if (['yes', 'yes approve', 'confirm', 'confirm it', 'go ahead', 'approve'].includes(normalized)) return 'CONFIRM';
  if (['no', 'cancel', 'stop', 'never mind', 'do not'].includes(normalized)) return 'CANCEL';
  return 'UNKNOWN';
}
