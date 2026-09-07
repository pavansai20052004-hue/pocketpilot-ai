import type { VoiceSessionContext } from './contracts';
import { EXACT_ALIASES } from './intentResolver';
import { validateVoiceIntent } from './intentValidator';

/** Recognition hints are fixed phrases only, never source text or analysis data. */
export function voiceCommandHints(context: VoiceSessionContext, forConfirmation: boolean): string[] {
  if (forConfirmation) return ['yes', 'yes approve', 'confirm', 'confirm it', 'go ahead', 'no', 'cancel', 'stop'];
  return EXACT_ALIASES.flatMap(([intent, phrases]) => validateVoiceIntent(intent, context).allowed ? [...phrases] : []);
}
