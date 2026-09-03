import { File } from 'expo-file-system';

import type { CapturedImage, PreparedImage } from './contracts';

export interface FileCleanupAdapter {
  remove(uri: string): void;
}

const nativeCleanup: FileCleanupAdapter = {
  remove(uri) {
    const file = new File(uri);
    if (file.exists) file.delete();
  },
};

export function cleanupVisionFiles(
  captured: CapturedImage | null,
  prepared: PreparedImage | null,
  adapter: FileCleanupAdapter = nativeCleanup,
): void {
  const removable = new Set<string>();
  if (captured?.ownership === 'APP_TEMPORARY') removable.add(captured.uri);
  if (prepared?.ownership === 'APP_TEMPORARY') removable.add(prepared.uri);
  for (const uri of removable) {
    try { adapter.remove(uri); } catch { /* Cache cleanup is best effort and never touches gallery originals. */ }
  }
}
