import { NativeModules } from 'react-native';

export type CalendarEvent = { eventId: string; title: string; startEpochMs: number; endEpochMs: number; location: string; organizer: string; allDay: boolean };
type NativeCalendar = { getUpcomingEvents: (hours: number) => Promise<CalendarEvent[]> };
const { AiosCalendar } = NativeModules as { AiosCalendar?: NativeCalendar };
export function getCalendarModule(): NativeCalendar {
  if (!AiosCalendar) throw new Error('AiosCalendar native module is unavailable. Run an Android native build after prebuild.');
  return AiosCalendar;
}
