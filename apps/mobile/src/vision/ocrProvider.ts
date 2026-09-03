import type { OcrResult, OcrTextBlock } from '@pocketpilot/shared-types';

import type { OCRProvider, PreparedImage } from './contracts';
import { OcrProviderError } from './contracts';
import { normalizeTechnicalText } from './normalizer';
import { postprocessErrorText } from './postprocessor';
import { detectSensitiveOcrText } from './privacy';
import { evaluateOcrQuality } from './quality';

interface NativeOcrFrame { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
interface NativeOcrBlock { readonly text: string; readonly frame?: NativeOcrFrame }
interface NativeOcrResult { readonly text: string; readonly blocks: ReadonlyArray<NativeOcrBlock> }
export type NativeRecognizer = (uri: string) => Promise<NativeOcrResult>;

async function recognizeWithMlKit(uri: string): Promise<NativeOcrResult> {
  try {
    const module = await import('rn-mlkit-ocr');
    return await module.default.recognizeText(uri, 'latin');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown native OCR failure.';
    if (/native module|not found|unavailable|TurboModule/i.test(message)) {
      throw new OcrProviderError('UNAVAILABLE', 'On-device OCR requires the PocketPilot development build, not Expo Go or web.', { cause: error });
    }
    throw new OcrProviderError('RECOGNITION_FAILED', 'On-device OCR could not read this image. Retake it with sharper focus and higher contrast.', { cause: error });
  }
}

export class OnDeviceOcrProvider implements OCRProvider {
  readonly name = 'Google ML Kit (on device)';

  constructor(private readonly recognizer: NativeRecognizer = recognizeWithMlKit) {}

  async recognize(image: PreparedImage): Promise<OcrResult> {
    if (!image.uri || image.width < 1 || image.height < 1) {
      throw new OcrProviderError('INVALID_IMAGE', 'The selected image has invalid dimensions.');
    }
    const started = Date.now();
    let native: NativeOcrResult;
    try {
      native = await this.recognizer(image.uri);
    } catch (error) {
      if (error instanceof OcrProviderError) throw error;
      throw new OcrProviderError('RECOGNITION_FAILED', 'On-device OCR failed safely. No image was uploaded.', { cause: error });
    }
    const rawText = native.text ?? '';
    const normalized = normalizeTechnicalText(rawText);
    const postprocessed = postprocessErrorText(normalized);
    const securityWarnings = detectSensitiveOcrText(postprocessed.text);
    const quality = evaluateOcrQuality(postprocessed.text, rawText, [...postprocessed.warnings, ...securityWarnings]);
    const blocks: ReadonlyArray<OcrTextBlock> = (native.blocks ?? []).map((block) => ({
      text: block.text,
      bounding_box: block.frame === undefined ? null : {
        x: block.frame.x, y: block.frame.y, width: block.frame.width, height: block.frame.height,
      },
      confidence: null,
    }));
    return {
      source: image.source,
      raw_text: rawText,
      normalized_text: postprocessed.text,
      blocks,
      quality,
      image_width: image.width,
      image_height: image.height,
      orientation_degrees: image.orientation_degrees,
      duration_ms: Math.max(0, Date.now() - started),
      created_at: new Date().toISOString(),
    };
  }
}

export class MockOcrProvider implements OCRProvider {
  readonly name = 'Mock OCR';
  constructor(private readonly result: OcrResult) {}
  async recognize(): Promise<OcrResult> { return this.result; }
}
