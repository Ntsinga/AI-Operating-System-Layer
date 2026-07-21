import { NativeModules } from 'react-native';

export type AppHealthResult = { packageName: string; appName: string; enabled: boolean; systemApp: boolean; versionName: string; versionCode: number; uid: number; launchable: boolean };
export type AppSettingsResult = { packageName: string; opened: boolean };
type NativeAppHealth = { inspect: (packageName: string) => Promise<AppHealthResult>; openSettings: (packageName: string) => Promise<AppSettingsResult> };
const { AiosAppHealth } = NativeModules as { AiosAppHealth?: NativeAppHealth };
export function getAppHealthModule(): NativeAppHealth {
  if (!AiosAppHealth) throw new Error('AiosAppHealth native module is unavailable. Run an Android native build after prebuild.');
  return AiosAppHealth;
}
