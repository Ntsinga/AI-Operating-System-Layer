import { NativeModules } from 'react-native';

type VoiceActivationNativeModule = {
  startVoiceActivation: () => Promise<boolean>;
  stopVoiceActivation: () => Promise<boolean>;
  isVoiceActivationActive: () => Promise<boolean>;
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
