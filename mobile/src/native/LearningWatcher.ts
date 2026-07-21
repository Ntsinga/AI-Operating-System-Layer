import { Linking, NativeModules } from 'react-native';

type LearningWatcherModule = {
  setRecording: (enabled: boolean) => Promise<void>;
  drainActions: () => Promise<Array<Record<string, unknown>>>;
  replayActions: (actions: Array<Record<string, unknown>>) => Promise<{ executed: number; skipped: number }>;
};

const native = NativeModules.LearningWatcher as LearningWatcherModule | undefined;

export function openAccessibilitySettings() {
  return Linking.sendIntent('android.settings.ACCESSIBILITY_SETTINGS');
}

export function setLearningRecording(enabled: boolean) {
  if (!native) throw new Error('Learning watcher is only available on Android.');
  return native.setRecording(enabled);
}

export function drainLearningActions() {
  if (!native) return Promise.resolve([]);
  return native.drainActions();
}

export function replayLearningActions(actions: Array<Record<string, unknown>>) {
  if (!native) throw new Error('Learning watcher is only available on Android.');
  return native.replayActions(actions);
}
