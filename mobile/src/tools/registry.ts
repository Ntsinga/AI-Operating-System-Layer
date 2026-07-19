import {
  getAppManager,
  type InstalledApp,
  type OpenApplicationResult,
} from '../native/AppManager';
import type { ToolDefinition } from './types';

export type OpenApplicationInput = {
  packageName: string;
};

export const getInstalledAppsTool = {
  name: 'get_installed_apps',
  description: 'Gets launchable applications installed on the Android device.',
  parameters: {},
  execute: () => getAppManager().getInstalledApps(),
} satisfies ToolDefinition<void, InstalledApp[]>;

export const openApplicationTool = {
  name: 'open_application',
  description: 'Opens an installed Android application by its package name.',
  parameters: {
    packageName: {
      type: 'string',
      description: 'The Android package name to launch, e.g. com.android.chrome.',
    },
  },
  execute: (input: OpenApplicationInput) => getAppManager().openApplication(input.packageName),
} satisfies ToolDefinition<OpenApplicationInput, OpenApplicationResult>;

// Registry of all capabilities. The future LLM planner inspects this list
// before choosing a tool, so keep names/descriptions/parameters accurate.
export const tools: ToolDefinition<any, any>[] = [getInstalledAppsTool, openApplicationTool];
