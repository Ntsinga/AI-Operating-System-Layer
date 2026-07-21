import { NativeModules } from 'react-native';

export type MakeCallResult = {
  phoneNumber: string;
  called: boolean;
};

type PhoneCallNativeModule = {
  makeCall: (phoneNumber: string) => Promise<MakeCallResult>;
};

const { AiosPhoneCall } = NativeModules as { AiosPhoneCall?: PhoneCallNativeModule };

export function getPhoneCallModule(): PhoneCallNativeModule {
  if (!AiosPhoneCall) {
    throw new Error('AiosPhoneCall native module is unavailable. Run an Android native build after prebuild.');
  }

  return AiosPhoneCall;
}
