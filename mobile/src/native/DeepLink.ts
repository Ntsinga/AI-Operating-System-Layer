import { NativeModules } from 'react-native';

export type OpenUriResult = {
  uri: string;
  opened: boolean;
};

type DeepLinkNativeModule = {
  openUri: (uri: string) => Promise<OpenUriResult>;
};

const { AiosDeepLink } = NativeModules as { AiosDeepLink?: DeepLinkNativeModule };

export function getDeepLinkModule(): DeepLinkNativeModule {
  if (!AiosDeepLink) {
    throw new Error('AiosDeepLink native module is unavailable. Run an Android native build after prebuild.');
  }

  return AiosDeepLink;
}
