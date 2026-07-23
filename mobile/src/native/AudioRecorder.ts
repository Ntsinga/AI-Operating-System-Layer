import { NativeModules } from 'react-native';

export type StopRecordingResult = {
  uri: string;
  path: string;
};

type AudioRecorderNativeModule = {
  startRecording: () => Promise<boolean>;
  stopRecording: () => Promise<StopRecordingResult>;
};

const { AiosAudioRecorder } = NativeModules as { AiosAudioRecorder?: AudioRecorderNativeModule };

export function getAudioRecorderModule(): AudioRecorderNativeModule {
  if (!AiosAudioRecorder) {
    throw new Error('AiosAudioRecorder native module is unavailable. Run an Android native build after prebuild.');
  }

  return AiosAudioRecorder;
}
