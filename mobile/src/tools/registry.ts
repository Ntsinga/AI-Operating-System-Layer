import { getAppManager, type InstalledApp } from '../native/AppManager';
import type { ToolDefinition } from './types';

export const tools = [
  {
    name: 'get_installed_apps',
    description: 'Gets launchable applications installed on the Android device.',
    parameters: {},
    execute: () => getAppManager().getInstalledApps(),
  },
] satisfies ToolDefinition<InstalledApp[]>[];