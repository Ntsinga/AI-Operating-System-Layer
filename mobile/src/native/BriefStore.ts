import { NativeModules } from 'react-native';
type NativeBriefStore = { saveBrief: (text: string) => Promise<boolean>; getBrief: () => Promise<string | null> };
const { AiosBriefStore } = NativeModules as { AiosBriefStore?: NativeBriefStore };
export function getBriefStore(): NativeBriefStore {
  if (!AiosBriefStore) throw new Error('AiosBriefStore native module is unavailable. Run an Android native build after prebuild.');
  return AiosBriefStore;
}
