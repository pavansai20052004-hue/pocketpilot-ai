import { describe, expect, it } from 'vitest';

import { OnDeviceOcrProvider } from './ocrProvider';

const image = { uri: 'file:///processed.jpg', width: 1200, height: 800, source: 'CAMERA' as const, ownership: 'APP_TEMPORARY' as const, orientation_degrees: 0 as const };

describe('on-device OCR provider contract', () => {
  it('keeps raw output separate, normalizes confirmed text, and maps geometry', async () => {
    const provider = new OnDeviceOcrProvider(async () => ({
      text: 'TypeError ： boom\n at app . ts ： 12',
      blocks: [{ text: 'TypeError ： boom', frame: { x: 2, y: 4, width: 90, height: 12 } }],
    }));
    const result = await provider.recognize(image);
    expect(result.raw_text).toContain('：');
    expect(result.normalized_text).toBe('TypeError: boom\n at app.ts: 12');
    expect(result.blocks[0]?.bounding_box).toEqual({ x: 2, y: 4, width: 90, height: 12 });
    expect(result.source).toBe('CAMERA');
  });

  it('converts native failures into a typed safe error', async () => {
    const provider = new OnDeviceOcrProvider(async () => { throw new Error('decoder crashed'); });
    await expect(provider.recognize(image)).rejects.toMatchObject({ code: 'RECOGNITION_FAILED' });
  });
});
