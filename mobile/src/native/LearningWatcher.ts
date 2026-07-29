import { Linking, NativeModules } from 'react-native';
import { BACKEND_BASE_URL } from '../config/backend';

type LearningWatcherModule = {
  setRecording: (enabled: boolean, targetSurface?: string) => Promise<void>;
  drainActions: () => Promise<Array<Record<string, unknown>>>;
  peekActions: () => Promise<Array<Record<string, unknown>>>;
  clearActions: () => Promise<void>;
  replayActions: (actions: Array<Record<string, unknown>>, values: Record<string, string>, completion: Record<string, string> | undefined, targetSurface: string | undefined, backendBaseUrl: string | undefined, procedureId: number | undefined) => Promise<{ executed: number; skipped: number; verified: number; trace?: Array<Record<string, unknown>> }>;
};

const native = NativeModules.LearningWatcher as LearningWatcherModule | undefined;

export function openAccessibilitySettings() {
  return Linking.sendIntent('android.settings.ACCESSIBILITY_SETTINGS');
}

export function setLearningRecording(enabled: boolean, targetSurface?: string) {
  if (!native) throw new Error('Learning watcher is only available on Android.');
  return native.setRecording(enabled, targetSurface);
}

export function drainLearningActions() {
  if (!native) return Promise.resolve([]);
  return native.drainActions();
}

export function peekLearningActions() {
  if (!native) return Promise.resolve([]);
  return native.peekActions();
}

export function clearLearningActions() {
  if (!native) return Promise.resolve();
  return native.clearActions();
}

// backendBaseUrl feeds LearningWatcherService.kt's bounded replay-recovery fallback
// (POST /replay/recovery) for a tap step whose selector no longer matches anything - defaults
// to the app's own backend so existing callers don't need to change to get recovery for free.
// procedureId (when known) lets a successful auto-resolved recovery self-heal: the corrected
// selector gets saved as a new procedure version via POST /procedures/{id}/correct-step, so a
// future replay of the same procedure hits the ordinary match path and doesn't need recovery
// again for that step.
export function replayLearningActions(actions: Array<Record<string, unknown>>, values: Record<string, string>, completion?: Record<string, string>, targetSurface?: string, backendBaseUrl: string = BACKEND_BASE_URL, procedureId?: number) {
  if (!native) throw new Error('Learning watcher is only available on Android.');
  return native.replayActions(actions, values, completion, targetSurface, backendBaseUrl, procedureId);
}
