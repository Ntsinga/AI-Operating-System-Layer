import { NativeModules } from 'react-native';

type NativePrefs = {
  getString: (key: string) => Promise<string | null>;
  setString: (key: string, value: string) => Promise<boolean>;
};

const { AiosPrefs } = NativeModules as { AiosPrefs?: NativePrefs };

// Values are stored as JSON strings. When the native module isn't in the installed build yet the
// store falls back to memory, so the Home screen still works (it just forgets its preferences
// on restart) instead of failing outright.
const memory = new Map<string, string>();

export async function getPref<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = AiosPrefs ? await AiosPrefs.getString(key) : (memory.get(key) ?? null);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export async function setPref(key: string, value: unknown): Promise<void> {
  const raw = JSON.stringify(value);
  memory.set(key, raw);
  try {
    if (AiosPrefs) await AiosPrefs.setString(key, raw);
  } catch {
    // The in-memory copy above keeps the value for this session.
  }
}
