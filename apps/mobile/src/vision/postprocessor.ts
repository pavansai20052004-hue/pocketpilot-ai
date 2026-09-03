import type { OcrWarningCode } from '@pocketpilot/shared-types';

export interface PostprocessedErrorText {
  readonly text: string;
  readonly warnings: ReadonlyArray<OcrWarningCode>;
}

const ERROR_ANCHOR = /(?:traceback|(?:fatal\s+)?error\b|exception\b|panic\b|failed\b|cannot\s+find|undefined reference)/i;
const TECHNICAL_CONTINUATION = /(?:^\s+at\s|^\s*File\s+["']|^\s*\^|^\s*Caused by:|\.\w{1,5}:\d+|line\s+\d+|\w+(?:Error|Exception):)/i;

export function postprocessErrorText(normalizedText: string): PostprocessedErrorText {
  const lines = normalizedText.split('\n');
  const firstAnchor = lines.findIndex((line) => ERROR_ANCHOR.test(line));
  if (firstAnchor <= 0) return { text: normalizedText, warnings: [] };

  const prefix = lines.slice(0, firstAnchor);
  const prefixHasTechnicalSignal = prefix.some((line) => TECHNICAL_CONTINUATION.test(line));
  if (prefixHasTechnicalSignal || firstAnchor > 6) return { text: normalizedText, warnings: [] };

  return {
    text: lines.slice(firstAnchor).join('\n').trim(),
    warnings: ['TEXT_TRIMMED_TO_ERROR'],
  };
}
