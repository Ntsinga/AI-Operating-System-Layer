import { NativeModules } from 'react-native';

export type MediaCaptureResult = {
  uri: string;
};

type MediaCaptureNativeModule = {
  takePhoto: () => Promise<MediaCaptureResult>;
  recordVideo: () => Promise<MediaCaptureResult>;
};

const { AiosMediaCapture } = NativeModules as { AiosMediaCapture?: MediaCaptureNativeModule };

export function getMediaCaptureModule(): MediaCaptureNativeModule {
  if (!AiosMediaCapture) {
    throw new Error('AiosMediaCapture native module is unavailable. Run an Android native build after prebuild.');
  }

  return AiosMediaCapture;
}
