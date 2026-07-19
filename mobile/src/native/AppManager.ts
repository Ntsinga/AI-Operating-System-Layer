import { NativeModules } from 'react-native';

export type InstalledApp = {
  name: string;
  packageName: string;
  launchable: boolean;
};

type AppManagerNativeModule = {
  getInstalledApps: () => Promise<InstalledApp[]>;
};

const { AppManager } = NativeModules as { AppManager?: AppManagerNativeModule };

export function getAppManager(): AppManagerNativeModule {
  if (!AppManager) {
    throw new Error('AppManager native module is unavailable. Run an Android native build after prebuild.');
  }

  return AppManager;
}