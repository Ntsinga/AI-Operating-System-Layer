import { NativeModules } from 'react-native';

export type AlarmResult = { hour: number; minute: number; label: string; openedSystemAlarm: boolean };
type NativeAlarm = { setAlarm: (hour: number, minute: number, label?: string) => Promise<AlarmResult> };
const { AiosAlarm } = NativeModules as { AiosAlarm?: NativeAlarm };
export function getAlarmModule(): NativeAlarm {
  if (!AiosAlarm) throw new Error('AiosAlarm native module is unavailable. Run an Android native build after prebuild.');
  return AiosAlarm;
}
