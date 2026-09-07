import * as Speech from 'expo-speech';

import type { SpeechOutputProvider } from './contracts';

export class AndroidTextToSpeech implements SpeechOutputProvider {
  async getAvailable(locale: string): Promise<boolean> {
    try {
      const voices = await Speech.getAvailableVoicesAsync();
      return voices.some((voice) => voice.language.toLocaleLowerCase('en').startsWith(locale.toLocaleLowerCase('en').split('-')[0] ?? 'en'));
    } catch {
      return false;
    }
  }

  async speak(text: string, locale: string, onStart?: () => void): Promise<void> {
    await Speech.stop();
    await new Promise<void>((resolve, reject) => {
      const options: Parameters<typeof Speech.speak>[1] = {
        language: locale,
        rate: 0.92,
        pitch: 1,
        onDone: resolve,
        onStopped: resolve,
        onError: reject,
      };
      Speech.speak(text, onStart === undefined ? options : { ...options, onStart });
    });
  }

  stop(): Promise<void> { return Speech.stop(); }
}
