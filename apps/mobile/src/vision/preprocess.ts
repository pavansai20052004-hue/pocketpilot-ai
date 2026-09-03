import { manipulateAsync, SaveFormat, type Action } from 'expo-image-manipulator';

import type { CapturedImage, ImageOrientation, PreparedImage } from './contracts';

export interface ImageManipulatorAdapter {
  manipulate(uri: string, actions: Action[]): Promise<{ uri: string; width: number; height: number }>;
}

const nativeManipulator: ImageManipulatorAdapter = {
  manipulate: async (uri, actions) => manipulateAsync(uri, actions, { compress: 0.92, format: SaveFormat.JPEG }),
};

export async function preprocessImage(
  image: CapturedImage,
  orientation: ImageOrientation,
  cropToGuide: boolean,
  adapter: ImageManipulatorAdapter = nativeManipulator,
): Promise<PreparedImage> {
  const actions: Action[] = [];
  let width = image.width;
  let height = image.height;

  if (orientation !== 0) {
    actions.push({ rotate: orientation });
    if (orientation === 90 || orientation === 270) [width, height] = [height, width];
  }
  if (cropToGuide) {
    const cropWidth = Math.max(1, Math.round(width * 0.9));
    const cropHeight = Math.max(1, Math.round(height * 0.62));
    actions.push({ crop: {
      originX: Math.round((width - cropWidth) / 2),
      originY: Math.round((height - cropHeight) / 2),
      width: cropWidth,
      height: cropHeight,
    } });
    width = cropWidth;
    height = cropHeight;
  }
  const longest = Math.max(width, height);
  if (longest > 2200) {
    const ratio = 2200 / longest;
    const resizedWidth = Math.max(1, Math.round(width * ratio));
    const resizedHeight = Math.max(1, Math.round(height * ratio));
    actions.push({ resize: width >= height ? { width: resizedWidth } : { height: resizedHeight } });
  }

  const result = await adapter.manipulate(image.uri, actions);
  return {
    uri: result.uri,
    width: result.width,
    height: result.height,
    source: image.source,
    ownership: 'APP_TEMPORARY',
    orientation_degrees: orientation,
  };
}
