import type { OcrResult, VisionInputSource } from '@pocketpilot/shared-types';

export type ImageOwnership = 'APP_TEMPORARY' | 'EXTERNAL_ORIGINAL';
export type ImageOrientation = 0 | 90 | 180 | 270;

export interface CapturedImage {
  readonly uri: string;
  readonly width: number;
  readonly height: number;
  readonly source: VisionInputSource;
  readonly ownership: ImageOwnership;
}

export interface PreparedImage extends CapturedImage {
  readonly orientation_degrees: ImageOrientation;
}

export interface CaptureSource {
  readonly source: VisionInputSource;
  capture(): Promise<CapturedImage | null>;
}

export interface OCRProvider {
  readonly name: string;
  recognize(image: PreparedImage): Promise<OcrResult>;
}

export type OcrProviderErrorCode = 'UNAVAILABLE' | 'INVALID_IMAGE' | 'RECOGNITION_FAILED';

export class OcrProviderError extends Error {
  constructor(readonly code: OcrProviderErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'OcrProviderError';
  }
}
