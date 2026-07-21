import { NativeModules } from 'react-native';

export type BatteryDiagnosticsResult = {
  batteryPercent: number;
  charging: boolean;
  status: string;
  plugged: string;
  temperatureC: number;
  voltageMv: number;
  currentMicroamps: number;
  energyNanowattHours: number;
  health: string;
  powerSaverEnabled: boolean;
  measuredAtMillis: number;
};

type BatteryDiagnosticsNativeModule = {
  diagnoseBattery: () => Promise<BatteryDiagnosticsResult>;
};

const { AiosBatteryDiagnostics } = NativeModules as {
  AiosBatteryDiagnostics?: BatteryDiagnosticsNativeModule;
};

export function getBatteryDiagnosticsModule(): BatteryDiagnosticsNativeModule {
  if (!AiosBatteryDiagnostics) {
    throw new Error(
      'AiosBatteryDiagnostics native module is unavailable. Run an Android native build after prebuild.'
    );
  }
  return AiosBatteryDiagnostics;
}
