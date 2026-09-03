import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-image-picker', () => ({ launchImageLibraryAsync: vi.fn() }));

import { AndroidCameraCaptureSource, MockCaptureSource } from './captureSources';

describe('capture source abstraction', () => {
  it('marks camera output as temporary app data', async () => {
    const source = new AndroidCameraCaptureSource(async () => ({ uri: 'file:///camera.jpg', width: 800, height: 600 }));
    await expect(source.capture()).resolves.toMatchObject({ source: 'CAMERA', ownership: 'APP_TEMPORARY' });
  });

  it('supports deterministic mock and cancelled sources', async () => {
    const cancelled = new MockCaptureSource('GALLERY', null);
    await expect(cancelled.capture()).resolves.toBeNull();
  });
});
