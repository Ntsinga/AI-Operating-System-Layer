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
  // forceRestart discards the target app's existing activity back-stack (Intent.FLAG_ACTIVITY_CLEAR_TASK)
  // instead of just bringing whatever screen it was last on to the foreground - the closest
  // permission-free equivalent to force-stopping it first. Use true when the caller needs a known,
  // reproducible starting screen (e.g. teaching); leave false for a normal "open this app" action.
  openApplication: (packageName: string, forceRestart: boolean) => Promise<OpenApplicationResult>;
};

const { AppManager } = NativeModules as { AppManager?: AppManagerNativeModule };

export function getAppManager(): AppManagerNativeModule {
  if (!AppManager) {
    throw new Error('AppManager native module is unavailable. Run an Android native build after prebuild.');
  }

  return AppManager;
}