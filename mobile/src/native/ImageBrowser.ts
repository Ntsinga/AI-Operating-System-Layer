import { NativeModules } from 'react-native';

export type BrowseForImageResult = {
  imageUrl: string;
  title: string;
};

export type OpenAiosBrowserResult = {
  url: string;
  opened: boolean;
};

type ImageBrowserNativeModule = {
  browseForImage: (url: string) => Promise<BrowseForImageResult>;
  openUrlInAiosBrowser: (url: string) => Promise<OpenAiosBrowserResult>;
};

const { AiosImageBrowser } = NativeModules as { AiosImageBrowser?: ImageBrowserNativeModule };

export function getImageBrowserModule(): ImageBrowserNativeModule {
  if (!AiosImageBrowser) {
    throw new Error('AiosImageBrowser native module is unavailable. Run an Android native build after prebuild.');
  }
  return AiosImageBrowser;
}
