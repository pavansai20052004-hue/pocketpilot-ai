import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SpeechRecognizerCallbacks } from './contracts';

const native = vi.hoisted(() => ({
  listeners: new Map<string, (event: { error: string }) => void>(),
  start: vi.fn(),
  getSupportedLocales: vi.fn(),
}));

vi.mock('react-native', () => ({ Platform: { OS: 'android' }, Linking: { openSettings: vi.fn() } }));
vi.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {
    isRecognitionAvailable: () => true,
    supportsOnDeviceRecognition: () => true,
    getDefaultRecognitionService: () => ({ packageName: 'system.speech' }),
    getSupportedLocales: native.getSupportedLocales,
    start: native.start,
    abort: vi.fn(),
    addListener: (name: string, listener: (event: { error: string }) => void) => {
      native.listeners.set(name, listener);
      return { remove: () => native.listeners.delete(name) };
    },
  },
}));

import { AndroidSpeechRecognizer } from './speechRecognizer';

function callbacks(): SpeechRecognizerCallbacks {
  return { onListening: vi.fn(), onResult: vi.fn(), onError: vi.fn(), onEnd: vi.fn() };
}

describe('Android recognition locale selection', () => {
  beforeEach(() => { vi.clearAllMocks(); native.listeners.clear(); });

  it('does not force an en-US offline model for en-IN speech', async () => {
    native.getSupportedLocales.mockResolvedValue({ installedLocales: ['en-US'], locales: ['en-US', 'en-IN'] });
    const recognizer = new AndroidSpeechRecognizer();
    const capability = await recognizer.getCapability('en-IN');
    expect(capability.offline_supported).toBe(false);
    expect(capability.offline_verified).toBe(false);
    await recognizer.start('en-IN', callbacks());
    expect(native.start).toHaveBeenCalledWith(expect.objectContaining({
      lang: 'en-IN', requiresOnDeviceRecognition: false,
      androidIntentOptions: expect.objectContaining({ EXTRA_PREFER_OFFLINE: false }),
    }));
  });

  it('uses offline recognition for the exact installed locale', async () => {
    native.getSupportedLocales.mockResolvedValue({ installedLocales: ['en_IN'], locales: ['en-IN'] });
    const recognizer = new AndroidSpeechRecognizer();
    expect((await recognizer.getCapability('en-IN')).offline_requested).toBe(true);
    await recognizer.start('en-IN', callbacks());
    expect(native.start).toHaveBeenCalledWith(expect.objectContaining({ requiresOnDeviceRecognition: true }));
  });

  it('offers a user-triggered system-service retry after offline language rejection', async () => {
    native.getSupportedLocales.mockResolvedValue({ installedLocales: ['en-IN'], locales: ['en-IN'] });
    const recognizer = new AndroidSpeechRecognizer();
    await recognizer.getCapability('en-IN');
    const events = callbacks();
    await recognizer.start('en-IN', events);
    native.listeners.get('error')?.({ error: 'language-not-supported' });
    expect(events.onError).toHaveBeenCalledWith('SPEECH_UNAVAILABLE', expect.stringContaining('may use the internet'));
    expect(native.start).toHaveBeenCalledTimes(1);
    expect((await recognizer.getCapability('en-IN')).offline_requested).toBe(false);
    await recognizer.start('en-IN', callbacks());
    expect(native.start).toHaveBeenLastCalledWith(expect.objectContaining({ requiresOnDeviceRecognition: false }));
  });

  it('uses the system service if installed language detection fails', async () => {
    native.getSupportedLocales.mockRejectedValue(new Error('Not supported'));
    const recognizer = new AndroidSpeechRecognizer();
    expect((await recognizer.getCapability('en-IN')).available).toBe(true);
    await recognizer.start('en-IN', callbacks());
    expect(native.start).toHaveBeenCalledWith(expect.objectContaining({ requiresOnDeviceRecognition: false }));
  });

  it('detaches callbacks before abort so cancelled speech cannot deliver a late event', async () => {
    const recognizer = new AndroidSpeechRecognizer();
    const events = callbacks();
    await recognizer.start('en-IN', events);
    const lateError = native.listeners.get('error');
    recognizer.cancel();
    expect(native.listeners.size).toBe(0);
    lateError?.({ error: 'aborted' });
    expect(events.onError).not.toHaveBeenCalled();
  });

  it('passes the confirmation vocabulary to Android without changing the recognized-result policy', async () => {
    const recognizer = new AndroidSpeechRecognizer();
    await recognizer.start('en-IN', callbacks(), { contextualStrings: ['yes', 'cancel'] });
    expect(native.start).toHaveBeenCalledWith(expect.objectContaining({
      contextualStrings: ['yes', 'cancel'], maxAlternatives: 1, continuous: false,
    }));
  });
});
