import { NativeModules } from 'react-native';

export type InstalledApp = {
  name: string;
  packageName: string;
  launchable: boolean;
};

export type OpenApplicationResult = {
  packageName: string;
  launched: boolean;
};

type AppManagerNativeModule = {
  getInstalledApps: () => Promise<InstalledApp[]>;
  openApplication: (packageName: string) => Promise<OpenApplicationResult>;
};

const { AppManager } = NativeModules as { AppManager?: AppManagerNativeModule };

export function getAppManager(): AppManagerNativeModule {
  if (!AppManager) {
    throw new Error('AppManager native module is unavailable. Run an Android native build after prebuild.');
  }

  return AppManager;
}