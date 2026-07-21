import { NativeModules } from 'react-native';

export type SendSmsResult = {
  phoneNumber: string;
  sent: boolean;
  partCount: number;
};

type SmsNativeModule = {
  sendSms: (phoneNumber: string, message: string) => Promise<SendSmsResult>;
};

const { AiosSms } = NativeModules as { AiosSms?: SmsNativeModule };

export function getSmsModule(): SmsNativeModule {
  if (!AiosSms) {
    throw new Error('AiosSms native module is unavailable. Run an Android native build after prebuild.');
  }

  return AiosSms;
}
