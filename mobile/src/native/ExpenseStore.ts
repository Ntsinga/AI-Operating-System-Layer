import { NativeModules } from 'react-native';

type NativeExpenseStore = {
  addExpenseEntry: (entryJson: string) => Promise<boolean>;
  getExpenseEntries: () => Promise<string>;
  clearExpenseEntries: () => Promise<boolean>;
};

const { AiosExpenseStore } = NativeModules as { AiosExpenseStore?: NativeExpenseStore };

export function getExpenseStore(): NativeExpenseStore {
  if (!AiosExpenseStore) {
    throw new Error('AiosExpenseStore native module is unavailable. Run an Android native build after prebuild.');
  }

  return AiosExpenseStore;
}
