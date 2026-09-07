import type {
  SpeechCapability,
  SpeechOutputProvider,
  SpeechRecognitionResult,
  SpeechRecognizer,
  SpeechRecognizerCallbacks,
  VoiceErrorCode,
  VoicePermissionState,
} from './contracts';

export class MockSpeechRecognizer implements SpeechRecognizer {
  constructor(
    private readonly result: SpeechRecognitionResult | VoiceErrorCode,
    private permission: VoicePermissionState = 'GRANTED',
    private readonly capability: SpeechCapability = {
      available: true,
      locale: 'en-IN',
      offline_requested: true,
      offline_supported: true,
      offline_verified: true,
      provider_name: 'mock',
    },
  ) {}

  getCapability(): Promise<SpeechCapability> { return Promise.resolve(this.capability); }
  getPermission(): Promise<VoicePermissionState> { return Promise.resolve(this.permission); }
  requestPermission(): Promise<VoicePermissionState> { this.permission = this.permission === 'PERMANENTLY_DENIED' ? this.permission : 'GRANTED'; return Promise.resolve(this.permission); }
  async start(_locale: string, callbacks: SpeechRecognizerCallbacks): Promise<void> {
    callbacks.onListening();
    if (typeof this.result === 'string') callbacks.onError(this.result, 'Mock recognition failure.');
    else callbacks.onResult(this.result);
    callbacks.onEnd();
  }
  stop(): void {}
  cancel(): void {}
  dispose(): void {}
}

export class MockSpeechOutputProvider implements SpeechOutputProvider {
  readonly spoken: string[] = [];
  stopped = false;
  getAvailable(): Promise<boolean> { return Promise.resolve(true); }
  speak(text: string, _locale: string, onStart?: () => void): Promise<void> {
    this.stopped = false;
    this.spoken.push(text);
    onStart?.();
    return Promise.resolve();
  }
  stop(): Promise<void> { this.stopped = true; return Promise.resolve(); }
}
