import { NativeModules } from 'react-native';

export type FocusPolicyStatus = { active: boolean; packageNames: string[]; unlockAtEpochMs: number };
export type FocusPolicyResult = { packageNames?: string[]; durationMinutes?: number; unlockAtEpochMs?: number; active: boolean; restored?: boolean };
type NativeFocusPolicy = {
  startFocus: (packageNames: string[], durationMinutes: number) => Promise<FocusPolicyResult>;
  getFocusStatus: () => Promise<FocusPolicyStatus>;
  stopFocus: () => Promise<FocusPolicyResult>;
};
const { AiosFocusPolicy } = NativeModules as { AiosFocusPolicy?: NativeFocusPolicy };
export function getFocusPolicyModule(): NativeFocusPolicy {
  if (!AiosFocusPolicy) throw new Error('AiosFocusPolicy native module is unavailable. Run an Android native build after prebuild.');
  return AiosFocusPolicy;
}
