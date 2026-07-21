import { NativeModules } from 'react-native';

type OverlayNativeModule = {
  hasOverlayPermission: () => Promise<boolean>;
  requestOverlayPermission: () => Promise<null>;
  startOverlay: () => Promise<boolean>;
  stopOverlay: () => Promise<boolean>;
  isOverlayActive: () => Promise<boolean>;
};

const { AiosOverlay } = NativeModules as { AiosOverlay?: OverlayNativeModule };

export function getOverlayModule(): OverlayNativeModule {
  if (!AiosOverlay) {
    throw new Error('AiosOverlay native module is unavailable. Run an Android native build after prebuild.');
  }

  return AiosOverlay;
}
