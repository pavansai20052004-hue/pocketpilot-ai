import type { CapturedImage, ImageOrientation, PreparedImage } from './contracts';
import type { OcrResult } from '@pocketpilot/shared-types';

export type VisionPhase = 'SOURCE' | 'CAMERA' | 'PREVIEW' | 'PROCESSING' | 'REVIEW' | 'ERROR';

export interface VisionState {
  readonly phase: VisionPhase;
  readonly captured: CapturedImage | null;
  readonly prepared: PreparedImage | null;
  readonly result: OcrResult | null;
  readonly orientation: ImageOrientation;
  readonly message: string | null;
}

export type VisionAction =
  | { readonly type: 'OPEN_CAMERA' }
  | { readonly type: 'CAPTURED'; readonly image: CapturedImage }
  | { readonly type: 'ROTATE' }
  | { readonly type: 'PROCESS' }
  | { readonly type: 'RECOGNIZED'; readonly image: PreparedImage; readonly result: OcrResult }
  | { readonly type: 'FAIL'; readonly message: string }
  | { readonly type: 'RETAKE' }
  | { readonly type: 'RESET' };

export const initialVisionState: VisionState = {
  phase: 'SOURCE', captured: null, prepared: null, result: null, orientation: 0, message: null,
};

export function visionReducer(state: VisionState, action: VisionAction): VisionState {
  switch (action.type) {
    case 'OPEN_CAMERA': return { ...initialVisionState, phase: 'CAMERA' };
    case 'CAPTURED': return { ...initialVisionState, phase: 'PREVIEW', captured: action.image };
    case 'ROTATE': return { ...state, orientation: ((state.orientation + 90) % 360) as ImageOrientation };
    case 'PROCESS': return { ...state, phase: 'PROCESSING', message: null };
    case 'RECOGNIZED': return { ...state, phase: 'REVIEW', prepared: action.image, result: action.result, message: null };
    case 'FAIL': return { ...state, phase: 'ERROR', message: action.message };
    case 'RETAKE': return state.captured?.source === 'CAMERA' ? { ...initialVisionState, phase: 'CAMERA' } : initialVisionState;
    case 'RESET': return initialVisionState;
  }
}
