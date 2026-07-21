import { NativeModules } from 'react-native';

export type NetworkSettingsResult = {
  panel: 'wifi' | 'network';
  opened: boolean;
};

type NetworkActionsNativeModule = {
  openWifiSettings: () => Promise<NetworkSettingsResult>;
  openNetworkSettings: () => Promise<NetworkSettingsResult>;
};

const { AiosNetworkActions } = NativeModules as { AiosNetworkActions?: NetworkActionsNativeModule };

export function getNetworkActionsModule(): NetworkActionsNativeModule {
  if (!AiosNetworkActions) {
    throw new Error('AiosNetworkActions native module is unavailable. Run an Android native build after prebuild.');
  }
  return AiosNetworkActions;
}
