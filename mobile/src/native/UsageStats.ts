import { NativeModules } from 'react-native';

export type AppUsageResult = { packageName: string; appName: string; foregroundTimeMs: number; foregroundMinutes: number };
export type AppBatterySettingsResult = { packageName: string; opened: boolean };
export type BatteryOptimizationStatus = { packageName: string; ignoringBatteryOptimizations: boolean; normallyOptimized: boolean };

type UsageStatsNativeModule = {
  hasUsageAccess: () => Promise<boolean>;
  requestUsageAccess: () => Promise<boolean>;
  getAppUsage: (hours: number) => Promise<AppUsageResult[]>;
  openAppBatterySettings: (packageName: string) => Promise<AppBatterySettingsResult>;
  getBatteryOptimizationStatus: (packageName: string) => Promise<BatteryOptimizationStatus>;
  openBatteryOptimizationSettings: () => Promise<{ opened: boolean }>;
};

const { AiosUsageStats } = NativeModules as { AiosUsageStats?: UsageStatsNativeModule };

export function getUsageStatsModule(): UsageStatsNativeModule {
  if (!AiosUsageStats) throw new Error('AiosUsageStats native module is unavailable. Run an Android native build after prebuild.');
  return AiosUsageStats;
}
