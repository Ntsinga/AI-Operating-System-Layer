import { NativeModules } from 'react-native';

export type WallpaperTarget = 'home' | 'lock' | 'both';

export type SetWallpaperResult = {
  imageUri: string;
  target: WallpaperTarget;
  width: number;
  height: number;
};

type WallpaperNativeModule = {
  setWallpaper: (imageUri: string, target: WallpaperTarget) => Promise<SetWallpaperResult>;
};

const { AiosWallpaper } = NativeModules as { AiosWallpaper?: WallpaperNativeModule };

export function getWallpaperModule(): WallpaperNativeModule {
  if (!AiosWallpaper) {
    throw new Error('AiosWallpaper native module is unavailable. Run an Android native build after prebuild.');
  }

  return AiosWallpaper;
}
