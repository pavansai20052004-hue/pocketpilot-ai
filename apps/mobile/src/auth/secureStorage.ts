import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export interface StoredConnection {
  readonly serverAddress: string;
  readonly token: string;
  readonly deviceId: string;
  readonly displayName: string;
}

const STORAGE_KEY = 'pocketpilot.device.connection.v1';
let webMemory: string | null = null;

export async function saveConnection(connection: StoredConnection): Promise<void> {
  const value = JSON.stringify(connection);
  if (Platform.OS === 'web') {
    webMemory = value;
    return;
  }
  await SecureStore.setItemAsync(STORAGE_KEY, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function loadConnection(): Promise<StoredConnection | null> {
  const value = Platform.OS === 'web' ? webMemory : await SecureStore.getItemAsync(STORAGE_KEY);
  if (value === null) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isStoredConnection(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function clearConnection(): Promise<void> {
  if (Platform.OS === 'web') {
    webMemory = null;
    return;
  }
  await SecureStore.deleteItemAsync(STORAGE_KEY);
}

function isStoredConnection(value: unknown): value is StoredConnection {
  return typeof value === 'object' && value !== null
    && 'serverAddress' in value && typeof value.serverAddress === 'string'
    && 'token' in value && typeof value.token === 'string'
    && 'deviceId' in value && typeof value.deviceId === 'string'
    && 'displayName' in value && typeof value.displayName === 'string';
}
