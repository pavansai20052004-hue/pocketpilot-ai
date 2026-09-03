import { describe, expect, it } from 'vitest';

import { normalizeTechnicalText } from './normalizer';
import { postprocessErrorText } from './postprocessor';

describe('technical OCR normalization', () => {
  it('normalizes line endings, full-width punctuation, and technical spacing without changing identifiers', () => {
    const raw = 'TypeError ： cannot read properties of user_id\r\n  at UserService . getName （ src / user.ts ： 42 ）  ';
    expect(normalizeTechnicalText(raw)).toBe('TypeError: cannot read properties of user_id\n  at UserService.getName (src/user.ts: 42)');
  });

  it('does not guess ambiguous letters or numbers', () => {
    expect(normalizeTechnicalText('Error: variable lO0I is undefined')).toContain('lO0I');
  });

  it('removes a short visual header only when a later error anchor is clear', () => {
    const result = postprocessErrorText('TERMINAL — PROJECT\nBuild output\nTypeError: boom\n  at app.ts:12');
    expect(result.text).toBe('TypeError: boom\n  at app.ts:12');
    expect(result.warnings).toContain('TEXT_TRIMMED_TO_ERROR');
  });
});
