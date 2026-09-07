import { ExpoSpeechRecognitionModule, type ExpoSpeechRecognitionErrorCode } from 'expo-speech-recognition';
import { Linking, Platform } from 'react-native';

import type {
  SpeechCapability,
  SpeechRecognizer,
  SpeechRecognizerCallbacks,
  VoiceErrorCode,
  VoicePermissionState,
} from './contracts';

const COMMAND_HINTS = [
  'analyze this error', 'fix this', 'generate a fix', 'show patch', 'approve fix', 'run tests',
  'explain the problem', 'what changed', 'undo fix', 'scan an error', 'cancel',
];

export class AndroidSpeechRecognizer implements SpeechRecognizer {
  private subscriptions: Array<{ remove(): void }> = [];
  private callbacks: SpeechRecognizerCallbacks | null = null;
  private recognitionStartedAt = 0;
  private offlineAvailable = false;
  private systemServiceFallback = false;
  private finalDelivered = false;

  async getCapability(locale: string): Promise<SpeechCapability> {
    const available = ExpoSpeechRecognitionModule.isRecognitionAvailable();
    const offlineSupported = ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
    let installedOffline = false;
    if (available && offlineSupported) {
      try {
        const supported = await ExpoSpeechRecognitionModule.getSupportedLocales({});
        installedOffline = supported.installedLocales.some((item) => sameLocale(item, locale));
      } catch {
        installedOffline = false;
      }
    }
    this.offlineAvailable = installedOffline;
    const provider = Platform.OS === 'android' ? ExpoSpeechRecognitionModule.getDefaultRecognitionService().packageName : 'system';
    return {
      available,
      locale,
      offline_requested: installedOffline && !this.systemServiceFallback,
      offline_supported: installedOffline && !this.systemServiceFallback,
      offline_verified: false,
      provider_name: provider || null,
    };
  }

  async getPermission(): Promise<VoicePermissionState> {
    const permission = await ExpoSpeechRecognitionModule.getMicrophonePermissionsAsync();
    return permissionState(permission.status, permission.canAskAgain);
  }

  async requestPermission(): Promise<VoicePermissionState> {
    const permission = await ExpoSpeechRecognitionModule.requestMicrophonePermissionsAsync();
    return permissionState(permission.status, permission.canAskAgain);
  }

  async start(locale: string, callbacks: SpeechRecognizerCallbacks, options?: { readonly contextualStrings: readonly string[] }): Promise<void> {
    this.removeSubscriptions();
    this.callbacks = callbacks;
    this.recognitionStartedAt = Date.now();
    this.finalDelivered = false;
    this.subscriptions = [
      ExpoSpeechRecognitionModule.addListener('start', () => this.callbacks?.onListening()),
      ExpoSpeechRecognitionModule.addListener('result', (event) => {
        const first = event.results[0];
        if (first === undefined) return;
        if (event.isFinal && this.finalDelivered) return;
        if (event.isFinal) this.finalDelivered = true;
        const confidence = first.confidence < 0 ? null : first.confidence;
        this.callbacks?.onResult({
          transcript: first.transcript,
          confidence,
          isFinal: event.isFinal,
          recognition_duration_ms: Math.max(0, Date.now() - this.recognitionStartedAt),
        });
      }),
      ExpoSpeechRecognitionModule.addListener('nomatch', () => this.callbacks?.onError('NO_MATCH', 'PocketPilot could not match that speech. Try a short command.')),
      ExpoSpeechRecognitionModule.addListener('error', (event) => {
        if (event.error === 'language-not-supported' && this.offlineAvailable && !this.systemServiceFallback) {
          this.systemServiceFallback = true;
          this.callbacks?.onError('SPEECH_UNAVAILABLE', 'The offline English (India) model could not start. Tap to speak again to use the phone speech service, which may use the internet.');
          return;
        }
        this.callbacks?.onError(mapNativeError(event.error), friendlyRecognitionError(event.error));
      }),
      ExpoSpeechRecognitionModule.addListener('end', () => this.callbacks?.onEnd()),
    ];
    ExpoSpeechRecognitionModule.start({
      lang: locale,
      interimResults: true,
      maxAlternatives: 1,
      continuous: false,
      contextualStrings: options ? [...options.contextualStrings] : COMMAND_HINTS,
      requiresOnDeviceRecognition: this.offlineAvailable && !this.systemServiceFallback,
      androidIntentOptions: { EXTRA_PREFER_OFFLINE: this.offlineAvailable && !this.systemServiceFallback, EXTRA_MASK_OFFENSIVE_WORDS: false },
    });
  }

  stop(): void {
    try { ExpoSpeechRecognitionModule.stop(); } catch { /* Already stopped. */ }
  }

  cancel(): void {
    this.removeSubscriptions();
    this.callbacks = null;
    try { ExpoSpeechRecognitionModule.abort(); } catch { /* Already stopped or unavailable. */ }
  }
  dispose(): void { this.cancel(); this.removeSubscriptions(); this.callbacks = null; }

  private removeSubscriptions(): void {
    this.subscriptions.forEach((subscription) => subscription.remove());
    this.subscriptions = [];
  }
}

export function openVoiceSettings(): Promise<void> {
  return Linking.openSettings();
}

function permissionState(status: string, canAskAgain: boolean): VoicePermissionState {
  if (status === 'granted') return 'GRANTED';
  if (status === 'undetermined') return 'NOT_REQUESTED';
  return canAskAgain ? 'DENIED' : 'PERMANENTLY_DENIED';
}

function sameLocale(actual: string, requested: string): boolean {
  return actual.replaceAll('_', '-').toLocaleLowerCase('en') === requested.replaceAll('_', '-').toLocaleLowerCase('en');
}

function mapNativeError(error: ExpoSpeechRecognitionErrorCode): VoiceErrorCode {
  if (error === 'not-allowed') return 'MIC_PERMISSION_DENIED';
  if (error === 'service-not-allowed' || error === 'language-not-supported') return 'SPEECH_UNAVAILABLE';
  if (error === 'no-speech') return 'NO_SPEECH';
  if (error === 'network') return 'NETWORK_ERROR';
  if (error === 'busy') return 'RECOGNIZER_BUSY';
  if (error === 'speech-timeout') return 'TIMEOUT';
  if (error === 'aborted' || error === 'interrupted') return 'CANCELLED';
  return 'UNKNOWN';
}

function friendlyRecognitionError(error: ExpoSpeechRecognitionErrorCode): string {
  const messages: Partial<Record<ExpoSpeechRecognitionErrorCode, string>> = {
    'not-allowed': 'Microphone access is required for voice commands.',
    'service-not-allowed': 'Speech recognition is unavailable on this phone.',
    'language-not-supported': 'The selected speech service could not load English (India). Enable or download English (India) in your phone speech-service settings, then try again.',
    'no-speech': 'No speech was detected. Try again with a short command.',
    network: 'The phone speech service could not connect. Camera and manual input still work.',
    busy: 'The phone speech recognizer is busy. Wait a moment and try again.',
    'speech-timeout': 'Listening timed out before speech was detected.',
    aborted: 'Listening was cancelled.',
    interrupted: 'Listening was interrupted by another phone audio activity.',
  };
  return messages[error] ?? 'Speech recognition could not complete. Try again.';
}
