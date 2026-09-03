import { describe, expect, it } from 'vitest';

import { initialVisionState, visionReducer } from './state';

const cameraImage = { uri: 'file:///camera.jpg', width: 1000, height: 700, source: 'CAMERA' as const, ownership: 'APP_TEMPORARY' as const };

describe('vision capture state', () => {
  it('moves through camera, preview, rotation, and processing states', () => {
    let state = visionReducer(initialVisionState, { type: 'OPEN_CAMERA' });
    state = visionReducer(state, { type: 'CAPTURED', image: cameraImage });
    state = visionReducer(state, { type: 'ROTATE' });
    state = visionReducer(state, { type: 'PROCESS' });
    expect(state).toMatchObject({ phase: 'PROCESSING', orientation: 90, captured: cameraImage });
  });

  it('returns camera captures to camera while gallery captures return to source selection', () => {
    const camera = visionReducer(visionReducer(initialVisionState, { type: 'CAPTURED', image: cameraImage }), { type: 'RETAKE' });
    const gallery = visionReducer(visionReducer(initialVisionState, { type: 'CAPTURED', image: { ...cameraImage, source: 'GALLERY', ownership: 'EXTERNAL_ORIGINAL' } }), { type: 'RETAKE' });
    expect(camera.phase).toBe('CAMERA');
    expect(gallery.phase).toBe('SOURCE');
  });
});
