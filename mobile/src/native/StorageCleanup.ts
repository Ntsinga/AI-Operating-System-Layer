import { NativeModules } from 'react-native';

export type StorageCandidate = {
  uri: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  sizeMb: number;
  modifiedAtMillis: number;
  ageDays: number;
  reason: 'large_file' | 'old_media' | 'largest_media';
};

type StorageCleanupNativeModule = {
  findStorageCandidates: (maxItems: number) => Promise<StorageCandidate[]>;
  deleteStorageCandidates: (uris: string[]) => Promise<{ deletedCount: number; confirmed: boolean }>;
};

const { AiosStorageCleanup } = NativeModules as { AiosStorageCleanup?: StorageCleanupNativeModule };

export function getStorageCleanupModule(): StorageCleanupNativeModule {
  if (!AiosStorageCleanup) {
    throw new Error('AiosStorageCleanup native module is unavailable. Run an Android native build after prebuild.');
  }
  return AiosStorageCleanup;
}
