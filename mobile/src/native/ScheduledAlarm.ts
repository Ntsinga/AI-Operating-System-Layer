import { NativeModules } from 'react-native';

export type ScheduledAlarmResult = { triggerAtEpochMs: number; label: string; scheduled: boolean };
type NativeScheduledAlarm = { schedule: (triggerAtEpochMs: number, label?: string) => Promise<ScheduledAlarmResult> };
const { AiosScheduledAlarm } = NativeModules as { AiosScheduledAlarm?: NativeScheduledAlarm };
export function getScheduledAlarmModule(): NativeScheduledAlarm {
  if (!AiosScheduledAlarm) throw new Error('AiosScheduledAlarm native module is unavailable. Run an Android native build after prebuild.');
  return AiosScheduledAlarm;
}
