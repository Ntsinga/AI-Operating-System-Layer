import { NativeModules } from 'react-native';

export type DeviceInfoResult = {
  batteryPercent: number;
  isCharging: boolean;
  deviceModel: string;
  deviceManufacturer: string;
  androidVersion: string;
  androidSdkInt: number;
  currentTimeMillis: number;
};

type DeviceInfoNativeModule = {
  getDeviceInfo: () => Promise<DeviceInfoResult>;
};

// Bridge name is "AiosDeviceInfo", not "DeviceInfo" — that name collides with a
// built-in React Native core module used internally by the Dimensions API.
const { AiosDeviceInfo } = NativeModules as { AiosDeviceInfo?: DeviceInfoNativeModule };

export function getDeviceInfoModule(): DeviceInfoNativeModule {
  if (!AiosDeviceInfo) {
    throw new Error('AiosDeviceInfo native module is unavailable. Run an Android native build after prebuild.');
  }

  return AiosDeviceInfo;
}
