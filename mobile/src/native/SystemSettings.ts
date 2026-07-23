import { NativeModules } from 'react-native';

export type SetScreenBrightnessResult = {
  brightness: number;
};

type SystemSettingsNativeModule = {
  setScreenBrightness: (level: number) => Promise<SetScreenBrightnessResult>;
};

const { AiosSystemSettings } = NativeModules as { AiosSystemSettings?: SystemSettingsNativeModule };

export function getSystemSettingsModule(): SystemSettingsNativeModule {
  if (!AiosSystemSettings) {
    throw new Error('AiosSystemSettings native module is unavailable. Run an Android native build after prebuild.');
  }

  return AiosSystemSettings;
}
