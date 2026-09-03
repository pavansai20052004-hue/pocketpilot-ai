import type { OcrQuality, OcrWarningCode } from '@pocketpilot/shared-types';

export function evaluateOcrQuality(
  normalizedText: string,
  rawText: string,
  additionalWarnings: ReadonlyArray<OcrWarningCode> = [],
): OcrQuality {
  const warnings = new Set<OcrWarningCode>(additionalWarnings);
  const visible = normalizedText.trim();
  let score = 100;

  if (!visible) {
    warnings.add('EMPTY_TEXT');
    score = 0;
  } else {
    if (visible.length < 24) { warnings.add('SHORT_TEXT'); score -= 30; }
    const technicalTokens = visible.match(/(?:Error|Exception|Traceback|\bat\b|File|line|\w+\.\w+|:\d+)/gi)?.length ?? 0;
    if (technicalTokens < 2) { warnings.add('LOW_TECHNICAL_SIGNAL'); score -= 25; }
    const replacementCount = (rawText.match(/[�□■]/g) ?? []).length;
    const punctuationNoise = (rawText.match(/[|]{3,}|[_~]{5,}|[^\w\s]{8,}/g) ?? []).join('').length;
    if ((replacementCount + punctuationNoise) / Math.max(rawText.length, 1) > 0.04) {
      warnings.add('NOISY_TEXT');
      score -= 30;
    }
    if (visible.split('\n').filter(Boolean).length >= 2) score += 5;
  }

  score = Math.max(0, Math.min(100, score));
  const level = score >= 75 ? 'GOOD' : score >= 50 ? 'REVIEW' : 'POOR';
  return { level, score, warnings: [...warnings] };
}
