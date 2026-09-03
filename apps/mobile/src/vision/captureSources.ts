import * as ImagePicker from 'expo-image-picker';

import type { CapturedImage, CaptureSource } from './contracts';

export type CameraCapture = () => Promise<{ uri: string; width: number; height: number } | undefined>;

export class AndroidCameraCaptureSource implements CaptureSource {
  readonly source = 'CAMERA' as const;

  constructor(private readonly takePicture: CameraCapture) {}

  async capture(): Promise<CapturedImage | null> {
    const picture = await this.takePicture();
    return picture === undefined ? null : {
      uri: picture.uri,
      width: picture.width,
      height: picture.height,
      source: this.source,
      ownership: 'APP_TEMPORARY',
    };
  }
}

export class GalleryCaptureSource implements CaptureSource {
  readonly source = 'GALLERY' as const;

  async capture(): Promise<CapturedImage | null> {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 1,
      exif: false,
      base64: false,
    });
    const asset = result.assets?.[0];
    if (result.canceled || asset === undefined) return null;
    return {
      uri: asset.uri,
      width: asset.width,
      height: asset.height,
      source: this.source,
      ownership: 'EXTERNAL_ORIGINAL',
    };
  }
}

export class MockCaptureSource implements CaptureSource {
  constructor(
    readonly source: 'CAMERA' | 'GALLERY',
    private readonly image: CapturedImage | null,
  ) {}

  async capture(): Promise<CapturedImage | null> {
    return this.image;
  }
}
