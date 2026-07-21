import { Linking, NativeModules } from 'react-native';

type LearningWatcherModule = {
  setRecording: (enabled: boolean) => Promise<void>;
  drainActions: () => Promise<Array<Record<string, unknown>>>;
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
