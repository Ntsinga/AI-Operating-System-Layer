import {
  getAppManager,
  type InstalledApp,
  type OpenApplicationResult,
} from '../native/AppManager';
import { getContactsManager, type Contact } from '../native/Contacts';
import { getDeviceInfoModule, type DeviceInfoResult } from '../native/DeviceInfo';
import { getLocationManager, type CurrentLocation } from '../native/LocationManager';
import type { ToolDefinition } from './types';

export type OpenApplicationInput = {
  packageName: string;
};

export const getInstalledAppsTool = {
  name: 'get_installed_apps',
  description: 'Gets launchable applications installed on the Android device.',
  parameters: { type: 'object', properties: {} },
  execute: () => getAppManager().getInstalledApps(),
} satisfies ToolDefinition<void, InstalledApp[]>;

export const openApplicationTool = {
  name: 'open_application',
  description: 'Opens an installed Android application by its package name.',
  parameters: {
    type: 'object',
    properties: {
      packageName: {
        type: 'string',
        description: 'The Android package name to launch, e.g. com.android.chrome.',
      },
    },
    required: ['packageName'],
  },
  execute: (input: OpenApplicationInput) => getAppManager().openApplication(input.packageName),
} satisfies ToolDefinition<OpenApplicationInput, OpenApplicationResult>;

export const getDeviceInfoTool = {
  name: 'get_device_info',
  description: 'Gets battery level, charging state, device model, Android version, and current time.',
  parameters: { type: 'object', properties: {} },
  execute: () => getDeviceInfoModule().getDeviceInfo(),
} satisfies ToolDefinition<void, DeviceInfoResult>;

export const getCurrentLocationTool = {
  name: 'get_current_location',
  description:
    'Gets the device current location (latitude/longitude) with explicit user permission. Requests ACCESS_FINE_LOCATION at call time.',
  parameters: { type: 'object', properties: {} },
  execute: () => getLocationManager().getCurrentLocation(),
} satisfies ToolDefinition<void, CurrentLocation>;

export const getContactsTool = {
  name: 'get_contacts',
  description:
    'Gets contact names and phone numbers from the device with explicit user permission. Requests READ_CONTACTS at call time.',
  parameters: { type: 'object', properties: {} },
  execute: () => getContactsManager().getContacts(),
} satisfies ToolDefinition<void, Contact[]>;

// Registry of all capabilities. The future LLM planner inspects this list
// before choosing a tool, so keep names/descriptions/parameters accurate.
export const tools: ToolDefinition<any, any>[] = [
  getInstalledAppsTool,
  openApplicationTool,
  getDeviceInfoTool,
  getCurrentLocationTool,
  getContactsTool,
];
