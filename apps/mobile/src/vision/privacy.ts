import type { OcrWarningCode } from '@pocketpilot/shared-types';

const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|password|passwd|secret)\s*[:=]/i,
  /\bBearer\s+[A-Za-z0-9._~+/-]{12,}={0,2}\b/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /(?:postgres|mysql|mongodb(?:\+srv)?):\/\/[^\s]+/i,
];

const PROMPT_INJECTION_PATTERNS = [
  /ignore (?:all |any )?(?:previous|prior|above) instructions/i,
  /(?:reveal|print|show) (?:the )?(?:system|developer) prompt/i,
  /you are now (?:a|an|the)\b/i,
  /disregard (?:the )?(?:rules|instructions|prompt)/i,
  /<\/?(?:system|assistant|developer)>/i,
];

export function detectSensitiveOcrText(text: string): ReadonlyArray<OcrWarningCode> {
  const warnings: OcrWarningCode[] = [];
  if (SECRET_PATTERNS.some((pattern) => pattern.test(text))) warnings.push('POSSIBLE_SECRET');
  if (PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(text))) warnings.push('POSSIBLE_PROMPT_INJECTION');
  return warnings;
}
