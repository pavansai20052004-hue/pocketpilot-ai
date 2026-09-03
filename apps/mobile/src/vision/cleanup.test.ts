import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-file-system', () => ({ File: class {} }));

import { cleanupVisionFiles } from './cleanup';

describe('vision file cleanup', () => {
  it('deletes camera and processed cache files but never a gallery original', () => {
    const remove = vi.fn();
    cleanupVisionFiles(
      { uri: 'content://gallery/original.png', width: 100, height: 100, source: 'GALLERY', ownership: 'EXTERNAL_ORIGINAL' },
      { uri: 'file:///cache/processed.jpg', width: 100, height: 100, source: 'GALLERY', ownership: 'APP_TEMPORARY', orientation_degrees: 0 },
      { remove },
    );
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith('file:///cache/processed.jpg');
  });

  it('deduplicates identical temporary URIs and makes cleanup best effort', () => {
    const remove = vi.fn(() => { throw new Error('already removed'); });
    cleanupVisionFiles(
      { uri: 'file:///cache/capture.jpg', width: 100, height: 100, source: 'CAMERA', ownership: 'APP_TEMPORARY' },
      { uri: 'file:///cache/capture.jpg', width: 100, height: 100, source: 'CAMERA', ownership: 'APP_TEMPORARY', orientation_degrees: 0 },
      { remove },
    );
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
