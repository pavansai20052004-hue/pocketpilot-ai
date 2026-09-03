import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  manipulateAsync: vi.fn(),
}));

import { preprocessImage } from './preprocess';

describe('vision image preprocessing', () => {
  it('creates a centered guide crop, rotates, and owns only the derivative', async () => {
    const manipulate = vi.fn().mockResolvedValue({ uri: 'file:///cache/processed.jpg', width: 720, height: 744 });
    const result = await preprocessImage(
      { uri: 'content://gallery/original.jpg', width: 1200, height: 800, source: 'GALLERY', ownership: 'EXTERNAL_ORIGINAL' },
      90,
      true,
      { manipulate },
    );
    expect(manipulate).toHaveBeenCalledWith('content://gallery/original.jpg', [
      { rotate: 90 },
      { crop: { originX: 40, originY: 228, width: 720, height: 744 } },
    ]);
    expect(result).toMatchObject({ uri: 'file:///cache/processed.jpg', source: 'GALLERY', ownership: 'APP_TEMPORARY', orientation_degrees: 90 });
  });

  it('downsamples oversized images before OCR', async () => {
    const manipulate = vi.fn().mockResolvedValue({ uri: 'file:///cache/large.jpg', width: 2200, height: 1100 });
    await preprocessImage(
      { uri: 'file:///camera.jpg', width: 4400, height: 2200, source: 'CAMERA', ownership: 'APP_TEMPORARY' },
      0,
      false,
      { manipulate },
    );
    expect(manipulate).toHaveBeenCalledWith('file:///camera.jpg', [{ resize: { width: 2200 } }]);
  });
});
