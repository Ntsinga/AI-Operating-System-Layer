import { NativeModules } from 'react-native';

export type StorageInfoResult = {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  usedPercent: number;
  path: string;
};

type StorageInfoNativeModule = {
  getStorageInfo: () => Promise<StorageInfoResult>;
};

const { AiosStorageInfo } = NativeModules as { AiosStorageInfo?: StorageInfoNativeModule };

export function getStorageInfoModule(): StorageInfoNativeModule {
  if (!AiosStorageInfo) {
    throw new Error('AiosStorageInfo native module is unavailable. Run an Android native build after prebuild.');
  }
  return AiosStorageInfo;
}
