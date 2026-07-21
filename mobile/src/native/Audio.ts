import { NativeModules } from 'react-native';

export type VolumeDirection = 'up' | 'down' | 'mute' | 'unmute';

export type AdjustVolumeResult = {
  currentVolume: number;
  maxVolume: number;
  isMuted: boolean;
};

type AudioNativeModule = {
  adjustVolume: (direction: VolumeDirection) => Promise<AdjustVolumeResult>;
};

const { AiosAudio } = NativeModules as { AiosAudio?: AudioNativeModule };

export function getAudioModule(): AudioNativeModule {
  if (!AiosAudio) {
    throw new Error('AiosAudio native module is unavailable. Run an Android native build after prebuild.');
  }

  return AiosAudio;
}
