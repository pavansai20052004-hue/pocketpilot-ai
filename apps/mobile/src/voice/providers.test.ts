import { describe, expect, it } from 'vitest';

import type { SpeechRecognitionResult } from './contracts';
import { MockSpeechOutputProvider, MockSpeechRecognizer } from './mocks';

describe('deterministic voice providers', () => {
  it('returns the fixed transcript without storing audio', async () => {
    const result: SpeechRecognitionResult = { transcript: 'fix this', confidence: null, isFinal: true, recognition_duration_ms: 25 };
    const recognizer = new MockSpeechRecognizer(result);
    let heard: SpeechRecognitionResult | null = null;
    await recognizer.start('en-IN', { onListening: () => undefined, onResult: (next) => { heard = next; }, onError: () => undefined, onEnd: () => undefined });
    expect(heard).toEqual(result);
  });

  it.each(['NO_MATCH', 'MIC_PERMISSION_DENIED', 'SPEECH_UNAVAILABLE', 'TIMEOUT', 'CANCELLED'] as const)('emits the deterministic %s state', async (expected) => {
    const recognizer = new MockSpeechRecognizer(expected);
    let received: string | null = null;
    await recognizer.start('en-IN', { onListening: () => undefined, onResult: () => undefined, onError: (code) => { received = code; }, onEnd: () => undefined });
    expect(received).toBe(expected);
  });

  it('records requested TTS text without producing sound', async () => {
    const output = new MockSpeechOutputProvider();
    await output.speak('The fix was verified.', 'en-IN');
    expect(output.spoken).toEqual(['The fix was verified.']);
    await output.stop();
    expect(output.stopped).toBe(true);
  });
});
