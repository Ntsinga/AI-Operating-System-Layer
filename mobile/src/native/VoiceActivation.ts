import { NativeModules } from 'react-native';

type VoiceActivationNativeModule = {
  startVoiceActivation: () => Promise<boolean>;
  stopVoiceActivation: () => Promise<boolean>;
  isVoiceActivationActive: () => Promise<boolean>;
  getSetupStatus: () => Promise<VoiceSetupStatus>;
  saveWakePhraseSample: (path: string, transcript: string, profile: 'low' | 'high') => Promise<boolean>;
  clearWakePhraseCalibration: () => Promise<boolean>;
};

export type VoiceSetupStatus = {
  hasMicPermission: boolean;
  hasOverlayPermission: boolean;
  voiceActive: boolean;
  overlayActive: boolean;
  calibrationComplete: boolean;
  wakePhrase: string;
};

const { AiosVoiceActivation } = NativeModules as {
  AiosVoiceActivation?: VoiceActivationNativeModule;
};

export function getVoiceActivationModule(): VoiceActivationNativeModule {
  if (!AiosVoiceActivation) {
    throw new Error(
      'AiosVoiceActivation native module is unavailable. Run an Android native build after prebuild.'
    );
  }

  return AiosVoiceActivation;
}
