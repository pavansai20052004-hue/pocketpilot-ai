import type { VoiceIntent, VoiceIntentValidation, VoiceSessionContext } from './contracts';

const denied = (reason: string): VoiceIntentValidation => ({ allowed: false, reason, confirmation_required: false });
const allowed = (reason: string, confirmationRequired = false): VoiceIntentValidation => ({ allowed: true, reason, confirmation_required: confirmationRequired });

export function validateVoiceIntent(intent: VoiceIntent, context: VoiceSessionContext): VoiceIntentValidation {
  switch (intent) {
    case 'SCAN_ERROR':
      return allowed('Opening the camera does not capture or submit anything automatically.');
    case 'ANALYZE_ERROR':
      if (context.session_state !== null && context.session_state !== 'IDLE') return denied('A debug session is already active.');
      return context.has_error_text ? allowed('The reviewed error text is ready for analysis.') : denied('There is no reviewed error text to analyze.');
    case 'EXPLAIN_ROOT_CAUSE':
    case 'SHOW_LOCATION':
      return context.has_analysis ? allowed('The explanation uses the existing structured analysis.') : denied('There is no root-cause analysis yet.');
    case 'GENERATE_PATCH':
      return context.session_state === 'ROOT_CAUSE_FOUND' ? allowed('A patch can be generated without modifying files.') : denied('A root cause must be ready before generating a fix.');
    case 'SHOW_PATCH':
      return context.has_patch ? allowed('The current reviewed patch is available.') : denied('There is no patch to show.');
    case 'APPROVE_PATCH':
      return context.session_state === 'AWAITING_APPROVAL' && context.has_patch && context.patch_status === 'AWAITING_APPROVAL'
        ? allowed('Applying the reviewed patch modifies files and runs approved validation.', true)
        : denied('There is no current fix ready to approve.');
    case 'REJECT_PATCH':
      return context.session_state === 'AWAITING_APPROVAL' && context.has_patch && context.patch_status === 'AWAITING_APPROVAL'
        ? allowed('The current patch can be rejected.')
        : denied('There is no current patch to reject.');
    case 'RUN_VALIDATION':
      return context.session_state === 'SUCCESS'
        ? allowed('The existing validation result is available.')
        : denied('Tests run automatically only through the existing approved patch workflow.');
    case 'EXPLAIN_FIX':
      return context.has_patch && ['SUCCESS', 'ROLLED_BACK'].includes(context.session_state ?? '') ? allowed('The explanation uses the verified patch data.') : denied('There is no completed fix to explain.');
    case 'TRY_ANOTHER_FIX':
      return context.session_state === 'FAILED' && context.retry_count < 2 ? allowed('The existing retry action is available.') : denied('Another safe retry is not available in the current state.');
    case 'ROLLBACK':
      return context.has_patch && context.patch_status === 'VERIFIED' && context.session_state === 'SUCCESS'
        ? allowed('Rollback restores the pre-fix files and requires confirmation.', true)
        : denied('There is no applied fix available to undo.');
    case 'SHOW_ERROR':
      return context.has_error_text ? allowed('The captured error is available on screen.') : denied('There is no captured error to show.');
    case 'SHOW_TEST_RESULT':
      return context.has_patch && ['SUCCESS', 'FAILED', 'ROLLED_BACK'].includes(context.session_state ?? '') ? allowed('The current validation result is available.') : denied('There is no completed test result yet.');
    case 'SHOW_SESSION_STATUS':
      return context.session_state === null ? denied('There is no active debug session.') : allowed('The current session status is available.');
    case 'CANCEL':
      return allowed('The voice request will be cancelled.');
    case 'CONFIRM':
      return denied('There is no voice action awaiting confirmation.');
    case 'UNKNOWN':
      return denied('Unsupported command. Nothing was executed.');
  }
}
