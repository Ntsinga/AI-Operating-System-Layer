import { Linking, NativeModules } from 'react-native';

type LearningWatcherModule = {
  setRecording: (enabled: boolean, targetSurface?: string) => Promise<void>;
  drainActions: () => Promise<Array<Record<string, unknown>>>;
  replayActions: (actions: Array<Record<string, unknown>>, values: Record<string, string>, completion?: Record<string, string>) => Promise<{ executed: number; skipped: number; verified: number }>;
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

export function replayLearningActions(actions: Array<Record<string, unknown>>, values: Record<string, string>, completion?: Record<string, string>) {
  if (!native) throw new Error('Learning watcher is only available on Android.');
  return native.replayActions(actions, values, completion);
}
