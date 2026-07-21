import { NativeModules } from 'react-native';

export type DevicePolicyStatus = {
  deviceOwner: boolean;
  provisioningAllowed: boolean;
  adminComponent: string;
  mode: 'managed_device' | 'normal_app';
};

export type ApplicationPolicyResult = {
  packageName?: string;
  packageNames?: string[];
  suspended: boolean;
  applied: boolean;
  failedPackages: string[];
};

type DevicePolicyNativeModule = {
  getPolicyStatus: () => Promise<DevicePolicyStatus>;
  setApplicationSuspended: (packageName: string, suspended: boolean) => Promise<ApplicationPolicyResult>;
  setApplicationsSuspended: (packageNames: string[], suspended: boolean) => Promise<ApplicationPolicyResult>;
  setKioskMode: (enabled: boolean) => Promise<{ enabled: boolean; applied: boolean }>;
};

const { AiosDevicePolicy } = NativeModules as { AiosDevicePolicy?: DevicePolicyNativeModule };

export function getDevicePolicyModule(): DevicePolicyNativeModule {
  if (!AiosDevicePolicy) {
    throw new Error('AiosDevicePolicy native module is unavailable. Run an Android native build after prebuild.');
  }
  return AiosDevicePolicy;
}
