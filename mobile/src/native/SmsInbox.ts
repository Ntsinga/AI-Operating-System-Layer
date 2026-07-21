import { NativeModules } from 'react-native';
export type SmsMessage = { address: string; body: string; dateEpochMs: number; type: number };
type NativeSmsInbox = { getRecentSms: (hours: number) => Promise<SmsMessage[]> };
const { AiosSmsInbox } = NativeModules as { AiosSmsInbox?: NativeSmsInbox };
export function getSmsInboxModule(): NativeSmsInbox { if (!AiosSmsInbox) throw new Error('AiosSmsInbox native module is unavailable. Run an Android native build after prebuild.'); return AiosSmsInbox; }
