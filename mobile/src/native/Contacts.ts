import { NativeModules } from 'react-native';

export type Contact = {
  id: string;
  name: string;
  phoneNumber: string;
};

type ContactsNativeModule = {
  getContacts: () => Promise<Contact[]>;
};

const { ContactsManager } = NativeModules as { ContactsManager?: ContactsNativeModule };

export function getContactsManager(): ContactsNativeModule {
  if (!ContactsManager) {
    throw new Error('ContactsManager native module is unavailable. Run an Android native build after prebuild.');
  }

  return ContactsManager;
}
