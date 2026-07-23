import { NativeModules } from 'react-native';

export type CurrentLocation = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  provider: string;
  timestampMillis: number;
};

type LocationNativeModule = {
  getCurrentLocation: () => Promise<CurrentLocation>;
};

const { LocationManagerModule } = NativeModules as { LocationManagerModule?: LocationNativeModule };

export function getLocationManager(): LocationNativeModule {
  if (!LocationManagerModule) {
    throw new Error('LocationManagerModule native module is unavailable. Run an Android native build after prebuild.');
  }

  return LocationManagerModule;
}
