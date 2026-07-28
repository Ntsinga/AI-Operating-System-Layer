import {
  getAppManager,
  type InstalledApp,
  type OpenApplicationResult,
} from '../native/AppManager';
import { getAudioModule, type AdjustVolumeResult, type VolumeDirection } from '../native/Audio';
import { getContactsManager, type Contact } from '../native/Contacts';
import { getDeepLinkModule, type OpenUriResult } from '../native/DeepLink';
import { getDeviceInfoModule, type DeviceInfoResult } from '../native/DeviceInfo';
import { getLocationManager, type CurrentLocation } from '../native/LocationManager';
import { getMediaCaptureModule, type MediaCaptureResult } from '../native/MediaCapture';
import { getPhoneCallModule, type MakeCallResult } from '../native/PhoneCall';
import { getSmsModule, type SendSmsResult } from '../native/Sms';
import { getSystemSettingsModule, type SetScreenBrightnessResult } from '../native/SystemSettings';
import { getWallpaperModule, type SetWallpaperResult, type WallpaperTarget } from '../native/Wallpaper';
import { getImageBrowserModule, type BrowseForImageResult, type OpenAiosBrowserResult } from '../native/ImageBrowser';
import { searchWeb, type WebSearchResult } from '../planner/searchWebClient';
import { searchImages, type ImageSearchResult } from '../planner/searchImagesClient';
import { getStorageInfoModule, type StorageInfoResult } from '../native/StorageInfo';
import { getNetworkInfoModule, type NetworkInfoResult, type NetworkTestResult } from '../native/NetworkInfo';
import { BACKEND_BASE_URL } from '../config/backend';
import { getNetworkActionsModule, type NetworkSettingsResult } from '../native/NetworkActions';
import { getBatteryDiagnosticsModule, type BatteryDiagnosticsResult } from '../native/BatteryDiagnostics';
import { getUsageStatsModule, type AppBatterySettingsResult, type AppUsageResult, type BatteryOptimizationStatus } from '../native/UsageStats';
import { getStorageCleanupModule, type StorageCandidate } from '../native/StorageCleanup';
import { getDevicePolicyModule, type DevicePolicyStatus, type ApplicationPolicyResult } from '../native/DevicePolicy';
import { getFocusPolicyModule, type FocusPolicyResult, type FocusPolicyStatus } from '../native/FocusPolicy';
import { getAlarmModule, type AlarmResult } from '../native/Alarm';
import { getScheduledAlarmModule, type ScheduledAlarmResult } from '../native/ScheduledAlarm';
import { getAppHealthModule, type AppHealthResult, type AppSettingsResult } from '../native/AppHealth';
import { getCalendarModule, type CalendarEvent } from '../native/Calendar';
import { searchGmail, readGmail, searchDrive, readDrive, getGoogleCalendarUpcoming, createGmailDraft, createGoogleCalendarEvent, type GmailSearchResult, type DriveSearchResult } from '../planner/googleWorkspaceClient';
import { getMonthlyFinances, analyzeSmsFinances, analyzeFinances, extractReceipt, type MonthlyFinance } from '../planner/expenseClient';
import { getSmsInboxModule, type SmsMessage } from '../native/SmsInbox';
import type { ToolDefinition } from './types';
import { listLearnedProcedures, recordDebugEvents } from '../planner/learningClient';
import { replayLearningActions } from '../native/LearningWatcher';

export type OpenApplicationInput = {
  packageName: string;
};

export type AdjustVolumeInput = {
  direction: VolumeDirection;
};

export type SearchYoutubeInput = {
  query: string;
};

export type OpenWebSearchInput = {
  query: string;
};

export type NavigateMapsInput = {
  destination: string;
};

export type OpenPlayStoreListingInput = {
  packageName?: string;
  query?: string;
};

export type SendSmsInput = {
  phoneNumber: string;
  message: string;
};

export type SetScreenBrightnessInput = {
  level: number;
};

export type SetWallpaperInput = {
  imageUri: string;
  target: WallpaperTarget;
};

export type BrowseForImageInput = {
  url: string;
};

export type OpenUrlInput = {
  url: string;
};

export type ReplayLearnedProcedureInput = {
  procedureId: number;
  runtimeValues?: Record<string, string>;
  completionSelector?: { resourceId?: string; text?: string; contentDescription?: string };
};

export type SearchWebInput = {
  query: string;
};

export type SearchImagesInput = {
  query: string;
};

export type MakeCallInput = {
  phoneNumber: string;
};

export const getInstalledAppsTool = {
  name: 'get_installed_apps',
  description: 'Gets launchable applications installed on the Android device.',
  parameters: { type: 'object', properties: {} },
  execute: () => getAppManager().getInstalledApps(),
} satisfies ToolDefinition<void, InstalledApp[]>;

export const openApplicationTool = {
  name: 'open_application',
  description: 'Opens an installed Android application selected by the planner or app picker.',
  parameters: {
    type: 'object',
    properties: {
      packageName: {
        type: 'string',
        description: 'Internal Android package id selected from get_installed_apps, e.g. com.android.chrome.',
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

export const getStorageInfoTool = {
  name: 'get_storage_info',
  description: 'Reports total, used, free, and percentage storage for the Android data partition. Read-only.',
  parameters: { type: 'object', properties: {} },
  execute: () => getStorageInfoModule().getStorageInfo(),
} satisfies ToolDefinition<void, StorageInfoResult>;

export const diagnoseNetworkTool = {
  name: 'diagnose_network',
  description:
    'Runs a read-only network diagnostic: active transports, validated internet state, metering, signal strength, DNS servers, and connectivity latency.',
  parameters: { type: 'object', properties: {} },
  execute: () => getNetworkInfoModule().diagnoseNetwork(),
} satisfies ToolDefinition<void, NetworkInfoResult>;

export type RunNetworkTestInput = { samples: number };
export const runNetworkTestTool = {
  name: 'run_network_test',
  description: 'Runs 1-5 connectivity probes and reports latency samples, average latency, and packet loss. Read-only; use before and after a network change to verify improvement.',
  parameters: { type: 'object', properties: { samples: { type: 'number', description: 'Number of probes, from 1 to 5.' } }, required: ['samples'] },
  execute: (input: RunNetworkTestInput) => getNetworkInfoModule().runNetworkTest(input.samples),
} satisfies ToolDefinition<RunNetworkTestInput, NetworkTestResult>;

export const openWifiSettingsTool = {
  name: 'open_wifi_settings',
  description:
    'Opens Android Wi-Fi settings so the user can choose or repair a network. Android does not allow ordinary apps to silently toggle Wi-Fi; rerun diagnose_network after the user changes it.',
  parameters: { type: 'object', properties: {} },
  execute: () => getNetworkActionsModule().openWifiSettings(),
} satisfies ToolDefinition<void, NetworkSettingsResult>;

export const openNetworkSettingsTool = {
  name: 'open_network_settings',
  description:
    'Opens Android network settings for broader connectivity repair. Rerun diagnose_network after the user changes settings.',
  parameters: { type: 'object', properties: {} },
  execute: () => getNetworkActionsModule().openNetworkSettings(),
} satisfies ToolDefinition<void, NetworkSettingsResult>;

export const diagnoseBatteryTool = {
  name: 'diagnose_battery',
  description:
    'Runs a read-only battery diagnostic: charge state, temperature, voltage, current draw, health, energy counter, and power-saver status. It does not change settings.',
  parameters: { type: 'object', properties: {} },
  execute: () => getBatteryDiagnosticsModule().diagnoseBattery(),
} satisfies ToolDefinition<void, BatteryDiagnosticsResult>;

export type GetAppUsageInput = { hours: number };

export const getAppUsageTool = {
  name: 'get_app_usage',
  description: 'Reads foreground usage by app for 1-168 hours. Requires Android Usage Access. This is an activity proxy, not privileged per-app battery drain.',
  parameters: { type: 'object', properties: { hours: { type: 'number', description: 'Lookback window in hours, from 1 to 168.' } }, required: ['hours'] },
  execute: (input: GetAppUsageInput) => getUsageStatsModule().getAppUsage(input.hours),
} satisfies ToolDefinition<GetAppUsageInput, AppUsageResult[]>;

export type OpenAppBatterySettingsInput = { packageName: string };

export const openAppBatterySettingsTool = {
  name: 'open_app_battery_settings',
  description: 'Opens Android settings for an app so the user can review its battery/background controls. The user makes the final policy change.',
  parameters: { type: 'object', properties: { packageName: { type: 'string', description: 'Internal id of the selected installed app.' } }, required: ['packageName'] },
  execute: (input: OpenAppBatterySettingsInput) => getUsageStatsModule().openAppBatterySettings(input.packageName),
} satisfies ToolDefinition<OpenAppBatterySettingsInput, AppBatterySettingsResult>;

export const getBatteryOptimizationStatusTool = {
  name: 'get_battery_optimization_status',
  description: 'Checks whether Android battery optimization is being bypassed for an app. Read-only; normally optimized apps are safer for battery.',
  parameters: { type: 'object', properties: { packageName: { type: 'string', description: 'Internal id of the selected installed app from get_installed_apps.' } }, required: ['packageName'] },
  execute: (input: OpenAppBatterySettingsInput) => getUsageStatsModule().getBatteryOptimizationStatus(input.packageName),
} satisfies ToolDefinition<OpenAppBatterySettingsInput, BatteryOptimizationStatus>;

export const openBatteryOptimizationSettingsTool = {
  name: 'open_battery_optimization_settings',
  description: 'Opens Android’s battery optimization list so the user can review apps that bypass optimization. The user makes the final change.',
  parameters: { type: 'object', properties: {} },
  execute: () => getUsageStatsModule().openBatteryOptimizationSettings(),
} satisfies ToolDefinition<void, { opened: boolean }>;

export type FindStorageCandidatesInput = { maxItems: number };

export const findStorageCandidatesTool = {
  name: 'find_storage_candidates',
  description:
    'Scans shared Android media with permission and returns the largest/oldest image, video, and audio candidates. Read-only; it never deletes anything.',
  parameters: { type: 'object', properties: { maxItems: { type: 'number', description: 'Maximum candidates to return, from 1 to 100.' } }, required: ['maxItems'] },
  execute: (input: FindStorageCandidatesInput) => getStorageCleanupModule().findStorageCandidates(input.maxItems),
} satisfies ToolDefinition<FindStorageCandidatesInput, StorageCandidate[]>;

export type DeleteStorageCandidatesInput = { uris: string[] };

export const deleteStorageCandidatesTool = {
  name: 'delete_storage_candidates',
  description:
    'Requests deletion of selected shared-media URIs. Android shows its own confirmation screen before deletion; never call this without the user explicitly approving the selected items.',
  parameters: { type: 'object', properties: { uris: { type: 'array', description: 'Selected content:// media URIs to delete.' } }, required: ['uris'] },
  execute: (input: DeleteStorageCandidatesInput) => getStorageCleanupModule().deleteStorageCandidates(input.uris),
} satisfies ToolDefinition<DeleteStorageCandidatesInput, { deletedCount: number; confirmed: boolean }>;

export const getDevicePolicyStatusTool = {
  name: 'get_device_policy_status',
  description: 'Reports whether AI-OS is provisioned as the Android device owner and whether managed-device provisioning is currently allowed. Read-only.',
  parameters: { type: 'object', properties: {} },
  execute: () => getDevicePolicyModule().getPolicyStatus(),
} satisfies ToolDefinition<void, DevicePolicyStatus>;

export type SetApplicationSuspendedInput = { packageName: string; suspended: boolean };

export const setApplicationSuspendedTool = {
  name: 'set_application_suspended',
  description: 'Suspends or unsuspends an installed app when AI-OS is the Android device owner. Requires managed-device provisioning and explicit user approval.',
  parameters: {
    type: 'object',
    properties: {
      packageName: { type: 'string', description: 'Internal id of the selected installed app.' },
      suspended: { type: 'boolean', description: 'True to block the app, false to restore it.' },
    },
    required: ['packageName', 'suspended'],
  },
  execute: (input: SetApplicationSuspendedInput) => getDevicePolicyModule().setApplicationSuspended(input.packageName, input.suspended),
} satisfies ToolDefinition<SetApplicationSuspendedInput, ApplicationPolicyResult>;

export type SetApplicationsSuspendedInput = { packageNames: string[]; suspended: boolean };

export const setApplicationsSuspendedTool = {
  name: 'set_applications_suspended',
  description: 'Suspends or restores a selected group of installed apps in one confirmation. Use after get_installed_apps to classify a request such as social media. Requires AI-OS Device Owner mode and must never include AI-OS itself.',
  parameters: {
    type: 'object',
    properties: {
      packageNames: { type: 'array', description: 'Internal app ids selected from get_installed_apps.' },
      suspended: { type: 'boolean', description: 'True to block the apps, false to restore them.' },
    },
    required: ['packageNames', 'suspended'],
  },
  execute: (input: SetApplicationsSuspendedInput) => getDevicePolicyModule().setApplicationsSuspended(input.packageNames, input.suspended),
} satisfies ToolDefinition<SetApplicationsSuspendedInput, ApplicationPolicyResult>;

export type SetKioskModeInput = { enabled: boolean };

export const setKioskModeTool = {
  name: 'set_kiosk_mode',
  description: 'Enters or exits Android lock-task kiosk mode. This can restrict the user to AI-OS and requires Device Owner plus explicit confirmation; do not use for ordinary app blocking.',
  parameters: {
    type: 'object',
    properties: { enabled: { type: 'boolean', description: 'True to restrict the device to AI-OS, false to exit kiosk mode.' } },
    required: ['enabled'],
  },
  execute: (input: SetKioskModeInput) => getDevicePolicyModule().setKioskMode(input.enabled),
} satisfies ToolDefinition<SetKioskModeInput, { enabled: boolean; applied: boolean }>;

export type StartFocusPolicyInput = { packageNames: string[]; durationMinutes: number };
export const startFocusPolicyTool = {
  name: 'start_focus_policy',
  description: 'Suspends a confirmed group of apps now and automatically restores them after durationMinutes, including when AI-OS is closed. Requires Device Owner.',
  parameters: { type: 'object', properties: { packageNames: { type: 'array', description: 'Internal app ids selected from get_installed_apps.' }, durationMinutes: { type: 'number', description: 'How long to block them, from 1 minute to 7 days.' } }, required: ['packageNames', 'durationMinutes'] },
  execute: (input: StartFocusPolicyInput) => getFocusPolicyModule().startFocus(input.packageNames, input.durationMinutes),
} satisfies ToolDefinition<StartFocusPolicyInput, FocusPolicyResult>;

export const getFocusPolicyStatusTool = {
  name: 'get_focus_policy_status', description: 'Reads the current timed focus policy and automatic unlock deadline. Read-only.', parameters: { type: 'object', properties: {} },
  execute: () => getFocusPolicyModule().getFocusStatus(),
} satisfies ToolDefinition<void, FocusPolicyStatus>;

export const stopFocusPolicyTool = {
  name: 'stop_focus_policy', description: 'Stops the active timed focus policy and restores the selected apps after explicit user confirmation.', parameters: { type: 'object', properties: {} },
  execute: () => getFocusPolicyModule().stopFocus(),
} satisfies ToolDefinition<void, FocusPolicyResult>;

export type SetAlarmInput = { hour: number; minute: number; label?: string };
export const setAlarmTool = {
  name: 'set_alarm',
  description: 'Creates an alarm through the Android system alarm app. Use 24-hour hour/minute values. For “tomorrow,” preserve the requested time and explain that Android will schedule the next occurrence; ask for clarification if the time is ambiguous.',
  parameters: {
    type: 'object',
    properties: {
      hour: { type: 'number', description: 'Hour from 0 to 23.' },
      minute: { type: 'number', description: 'Minute from 0 to 59.' },
      label: { type: 'string', description: 'Optional alarm label.' },
    },
    required: ['hour', 'minute'],
  },
  execute: (input: SetAlarmInput) => getAlarmModule().setAlarm(input.hour, input.minute, input.label),
} satisfies ToolDefinition<SetAlarmInput, AlarmResult>;

export type ScheduleDateAlarmInput = { triggerAtEpochMs: number; label?: string };
export const scheduleDateAlarmTool = {
  name: 'schedule_date_alarm',
  description: 'Schedules a one-time date-specific alarm and AI-OS notification, even when the app is closed. Convert the user’s explicit date/time into Unix epoch milliseconds using the current planner time. Requires Android exact-alarm permission.',
  parameters: { type: 'object', properties: { triggerAtEpochMs: { type: 'number', description: 'Future Unix timestamp in milliseconds.' }, label: { type: 'string', description: 'Alarm label.' } }, required: ['triggerAtEpochMs'] },
  execute: (input: ScheduleDateAlarmInput) => getScheduledAlarmModule().schedule(input.triggerAtEpochMs, input.label),
} satisfies ToolDefinition<ScheduleDateAlarmInput, ScheduledAlarmResult>;

export type InspectAppInput = { packageName: string };
export const inspectAppHealthTool = {
  name: 'inspect_app_health',
  description: 'Inspects a selected app’s enabled state, version, system-app status, UID, and launchability. Read-only.',
  parameters: { type: 'object', properties: { packageName: { type: 'string', description: 'Internal id of the selected installed app.' } }, required: ['packageName'] },
  execute: (input: InspectAppInput) => getAppHealthModule().inspect(input.packageName),
} satisfies ToolDefinition<InspectAppInput, AppHealthResult>;

export const openAppSettingsTool = {
  name: 'open_app_settings',
  description: 'Opens Android’s user-facing settings page for an app, where the user can review permissions, force stop, clear cache/data, and uninstall when allowed. Requires explicit confirmation.',
  parameters: { type: 'object', properties: { packageName: { type: 'string', description: 'Internal id of the selected installed app.' } }, required: ['packageName'] },
  execute: (input: InspectAppInput) => getAppHealthModule().openSettings(input.packageName),
} satisfies ToolDefinition<InspectAppInput, AppSettingsResult>;

export type GetUpcomingEventsInput = { hours: number };
export const getUpcomingEventsTool = {
  name: 'get_upcoming_events',
  description: 'Reads upcoming calendar events for 1-168 hours with user permission. Returns title, times, location, and organizer for meeting briefs.',
  parameters: { type: 'object', properties: { hours: { type: 'number', description: 'Lookahead window from 1 to 168 hours.' } }, required: ['hours'] },
  execute: (input: GetUpcomingEventsInput) => getCalendarModule().getUpcomingEvents(input.hours),
} satisfies ToolDefinition<GetUpcomingEventsInput, CalendarEvent[]>;

export const connectGoogleAccountTool = {
  name: 'connect_google_account',
  description: 'Opens Google OAuth consent for Gmail, Google Calendar, and Google Drive. The user signs in and grants only the requested scopes; AI-OS never asks for the Google password.',
  parameters: { type: 'object', properties: {} },
  execute: () => getDeepLinkModule().openUri(`${BACKEND_BASE_URL}/connect/google/start`),
} satisfies ToolDefinition<void, OpenUriResult>;

export type SearchGoogleInput = { query: string; maxResults: number };
export const searchGmailTool = {
  name: 'search_gmail', description: 'Searches the connected Gmail account read-only using Gmail query syntax. Requires Google OAuth connection.',
  parameters: { type: 'object', properties: { query: { type: 'string', description: 'Gmail query, for example from:person@example.com newer_than:30d.' }, maxResults: { type: 'number', description: 'Maximum results, 1-25.' } }, required: ['query', 'maxResults'] },
  execute: (input: SearchGoogleInput) => searchGmail(input.query, input.maxResults),
} satisfies ToolDefinition<SearchGoogleInput, GmailSearchResult[]>;
export const readGmailTool = {
  name: 'read_gmail_message', description: 'Reads the full body of one Gmail message returned by search_gmail. Read-only and requires Google OAuth.',
  parameters: { type: 'object', properties: { messageId: { type: 'string', description: 'Exact Gmail message ID from search_gmail.' } }, required: ['messageId'] },
  execute: (input: { messageId: string }) => readGmail(input.messageId),
} satisfies ToolDefinition<{ messageId: string }, GmailSearchResult & { body: string }>;
export const searchDriveTool = {
  name: 'search_google_drive', description: 'Searches connected Google Drive file names read-only. Requires Google OAuth connection.',
  parameters: { type: 'object', properties: { query: { type: 'string', description: 'Words from the file name.' }, maxResults: { type: 'number', description: 'Maximum results, 1-25.' } }, required: ['query', 'maxResults'] },
  execute: (input: SearchGoogleInput) => searchDrive(input.query, input.maxResults),
} satisfies ToolDefinition<SearchGoogleInput, DriveSearchResult[]>;
export const readDriveTool = {
  name: 'read_google_drive_file', description: 'Reads text content from one Google Drive file returned by search_google_drive. Read-only and requires Google OAuth.',
  parameters: { type: 'object', properties: { fileId: { type: 'string', description: 'Exact Drive file ID from search_google_drive.' } }, required: ['fileId'] },
  execute: (input: { fileId: string }) => readDrive(input.fileId),
} satisfies ToolDefinition<{ fileId: string }, DriveSearchResult & { content: string }>;
export const getGoogleCalendarUpcomingTool = {
  name: 'get_google_calendar_upcoming', description: 'Reads upcoming events from connected Google Calendar read-only. Requires Google OAuth connection.',
  parameters: { type: 'object', properties: { hours: { type: 'number', description: 'Lookahead hours, 1-168.' } }, required: ['hours'] },
  execute: (input: { hours: number }) => getGoogleCalendarUpcoming(input.hours),
} satisfies ToolDefinition<{ hours: number }, unknown[]>;
export const createGmailDraftTool = {
  name: 'create_gmail_draft', description: 'Creates a Gmail draft for user review; it never sends automatically. Requires explicit confirmation because it writes to Gmail.',
  parameters: { type: 'object', properties: { to: { type: 'string', description: 'Recipient email address.' }, subject: { type: 'string', description: 'Draft subject.' }, body: { type: 'string', description: 'Draft body.' } }, required: ['to', 'subject', 'body'] },
  execute: (input: { to: string; subject: string; body: string }) => createGmailDraft(input.to, input.subject, input.body),
} satisfies ToolDefinition<{ to: string; subject: string; body: string }, unknown>;
export const createGoogleCalendarEventTool = {
  name: 'create_google_calendar_event', description: 'Creates a Google Calendar follow-up event after explicit confirmation. Requires connected Google OAuth.',
  parameters: { type: 'object', properties: { title: { type: 'string', description: 'Event title.' }, startTime: { type: 'string', description: 'RFC3339 start time with timezone.' }, endTime: { type: 'string', description: 'RFC3339 end time with timezone.' }, description: { type: 'string', description: 'Event notes.' } }, required: ['title', 'startTime', 'endTime', 'description'] },
  execute: (input: { title: string; startTime: string; endTime: string; description: string }) => createGoogleCalendarEvent(input.title, input.startTime, input.endTime, input.description),
} satisfies ToolDefinition<{ title: string; startTime: string; endTime: string; description: string }, unknown>;
export const getMonthlyFinancesTool = {
  name: 'get_monthly_finances', description: 'Searches connected Gmail for likely expenses and revenue in a month, extracts candidate amounts, and returns reconciled totals with source IDs and confidence. Read-only; every item requires review.',
  parameters: { type: 'object', properties: { year: { type: 'number', description: 'Four-digit year.' }, month: { type: 'number', description: 'Month 1-12.' } }, required: ['year', 'month'] },
  execute: (input: { year: number; month: number }) => getMonthlyFinances(input.year, input.month),
} satisfies ToolDefinition<{ year: number; month: number }, MonthlyFinance>;
export const extractReceiptTool = {
  name: 'extract_receipt', description: 'OCRs a user-selected receipt image and extracts merchant, date, total, currency, tax, category, and confidence. Never submits or pays anything.',
  parameters: { type: 'object', properties: { imageUri: { type: 'string', description: 'Local receipt image URI from take_photo or a user-selected file.' } }, required: ['imageUri'] },
  execute: (input: { imageUri: string }) => extractReceipt(input.imageUri),
} satisfies ToolDefinition<{ imageUri: string }, Record<string, unknown>>;
export const getRecentSmsTool = {
  name: 'get_recent_sms', description: 'Reads recent SMS messages after explicit READ_SMS permission. Use for bank/mobile-money alerts and receipts; sensitive message content stays in the workflow context.',
  parameters: { type: 'object', properties: { hours: { type: 'number', description: 'Lookback window from 1 to 744 hours.' } }, required: ['hours'] },
  execute: (input: { hours: number }) => getSmsInboxModule().getRecentSms(input.hours),
} satisfies ToolDefinition<{ hours: number }, SmsMessage[]>;
export const analyzeSmsFinancesTool = {
  name: 'analyze_sms_finances', description: 'Classifies SMS bank/mobile-money candidates into expenses and revenue for a selected month. Use after get_recent_sms; read-only and review-required.',
  parameters: { type: 'object', properties: { year: { type: 'number', description: 'Four-digit year.' }, month: { type: 'number', description: 'Month 1-12.' }, messages: { type: 'array', description: 'Messages returned by get_recent_sms.' } }, required: ['year', 'month', 'messages'] },
  execute: (input: { year: number; month: number; messages: SmsMessage[] }) => analyzeSmsFinances(input.year, input.month, input.messages),
} satisfies ToolDefinition<{ year: number; month: number; messages: SmsMessage[] }, MonthlyFinance>;
export const analyzeFinancesTool = {
  name: 'analyze_finances', description: 'Generates a concise AI analysis of reviewed finance candidates: category concentration, revenue versus expenditure, anomalies, and practical next steps. Not financial advice.',
  parameters: { type: 'object', properties: { finances: { type: 'object', description: 'Finance summary returned by get_monthly_finances or analyze_sms_finances.' } }, required: ['finances'] },
  execute: (input: { finances: MonthlyFinance }) => analyzeFinances(input.finances),
} satisfies ToolDefinition<{ finances: MonthlyFinance }, string>;

export const getCurrentLocationTool = {
  name: 'get_current_location',
  description:
    'Gets the device current location (latitude/longitude) with explicit user permission. Use this to resolve "here", "current location", or pickup-from-me before replaying ride-hailing procedures.',
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

export const adjustVolumeTool = {
  name: 'adjust_volume',
  description: 'Adjusts the device media volume: raises, lowers, mutes, or unmutes it by one step.',
  parameters: {
    type: 'object',
    properties: {
      direction: {
        type: 'string',
        description: 'One of: up, down, mute, unmute.',
      },
    },
    required: ['direction'],
  },
  execute: (input: AdjustVolumeInput) => getAudioModule().adjustVolume(input.direction),
} satisfies ToolDefinition<AdjustVolumeInput, AdjustVolumeResult>;

export const searchYoutubeTool = {
  name: 'search_youtube',
  description: 'Opens YouTube already searching for the given query.',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string', description: 'What to search for on YouTube.' } },
    required: ['query'],
  },
  execute: (input: SearchYoutubeInput) =>
    getDeepLinkModule().openUri(`https://www.youtube.com/results?search_query=${encodeURIComponent(input.query)}`),
} satisfies ToolDefinition<SearchYoutubeInput, OpenUriResult>;

export const openWebSearchTool = {
  name: 'open_web_search',
  description: 'Opens a browser already searching the web for the given query.',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string', description: 'What to search for on the web.' } },
    required: ['query'],
  },
  execute: (input: OpenWebSearchInput) =>
    getDeepLinkModule().openUri(`https://www.google.com/search?q=${encodeURIComponent(input.query)}`),
} satisfies ToolDefinition<OpenWebSearchInput, OpenUriResult>;

export const navigateMapsTool = {
  name: 'navigate_maps',
  description: 'Opens Maps already routing to the given destination.',
  parameters: {
    type: 'object',
    properties: {
      destination: { type: 'string', description: 'An address or place name to navigate to.' },
    },
    required: ['destination'],
  },
  execute: (input: NavigateMapsInput) =>
    getDeepLinkModule().openUri(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(input.destination)}`
    ),
} satisfies ToolDefinition<NavigateMapsInput, OpenUriResult>;

export const openPlayStoreListingTool = {
  name: 'open_play_store_listing',
  description:
    'Opens Play Store for an app. Use packageName for a known exact app id, or query to search Play Store by app name. Cannot install automatically - Android does not allow that for a normal app.',
  parameters: {
    type: 'object',
    properties: {
      packageName: { type: 'string', description: 'Optional exact Android package id, e.g. com.pinterest.' },
      query: { type: 'string', description: 'Optional app name to search in Play Store, e.g. Pinterest.' },
    },
  },
  execute: (input: OpenPlayStoreListingInput) => {
    const packageName = input.packageName?.trim();
    const query = input.query?.trim();
    if (packageName) {
      return getDeepLinkModule().openUri(
        `https://play.google.com/store/apps/details?id=${encodeURIComponent(packageName)}`
      );
    }
    if (query) {
      return getDeepLinkModule().openUri(
        `https://play.google.com/store/search?q=${encodeURIComponent(query)}&c=apps`
      );
    }
    throw new Error('Enter an app name to search, or provide an exact app id.');
  },
} satisfies ToolDefinition<OpenPlayStoreListingInput, OpenUriResult>;

export const sendSmsTool = {
  name: 'send_sms',
  description: 'Sends an SMS text message to the given phone number. Requests SEND_SMS permission at call time.',
  parameters: {
    type: 'object',
    properties: {
      phoneNumber: { type: 'string', description: 'The destination phone number.' },
      message: { type: 'string', description: 'The text message body.' },
    },
    required: ['phoneNumber', 'message'],
  },
  execute: (input: SendSmsInput) => getSmsModule().sendSms(input.phoneNumber, input.message),
} satisfies ToolDefinition<SendSmsInput, SendSmsResult>;

export const makeCallTool = {
  name: 'make_call',
  description:
    'Places a phone call to the given phone number directly (no dialer confirmation screen). Requests CALL_PHONE permission at call time. To call a contact by name, call get_contacts first to find their number.',
  parameters: {
    type: 'object',
    properties: {
      phoneNumber: { type: 'string', description: 'The phone number to call.' },
    },
    required: ['phoneNumber'],
  },
  execute: (input: MakeCallInput) => getPhoneCallModule().makeCall(input.phoneNumber),
} satisfies ToolDefinition<MakeCallInput, MakeCallResult>;

export const setScreenBrightnessTool = {
  name: 'set_screen_brightness',
  description:
    'Sets the screen brightness (0-255). The first call may open a system settings screen asking the user to allow "Modify system settings" - after granting it, run this tool again.',
  parameters: {
    type: 'object',
    properties: {
      level: { type: 'number', description: 'Brightness level from 0 (dimmest) to 255 (brightest).' },
    },
    required: ['level'],
  },
  execute: (input: SetScreenBrightnessInput) => getSystemSettingsModule().setScreenBrightness(input.level),
} satisfies ToolDefinition<SetScreenBrightnessInput, SetScreenBrightnessResult>;

export const takePhotoTool = {
  name: 'take_photo',
  description:
    'Opens an in-app camera preview, counts down 3 seconds, then automatically takes a photo. Requires CAMERA permission. Returns the local file URI of the captured photo.',
  parameters: { type: 'object', properties: {} },
  execute: () => getMediaCaptureModule().takePhoto(),
} satisfies ToolDefinition<void, MediaCaptureResult>;

export const recordVideoTool = {
  name: 'record_video',
  description:
    'Opens an in-app camera preview and starts recording immediately (with audio). Stops when the user taps Stop, or automatically after 60 seconds. Requires CAMERA and RECORD_AUDIO permission. Returns the local file URI of the recording. Always visible on screen while recording - never records silently in the background.',
  parameters: { type: 'object', properties: {} },
  execute: () => getMediaCaptureModule().recordVideo(),
} satisfies ToolDefinition<void, MediaCaptureResult>;

export const searchWebTool = {
  name: 'search_web',
  description:
    'Searches the web and returns up to 5 structured results (title, url, description) into this app. To restrict to app listings, include "site:play.google.com" in the query. Use open_web_search or open_play_store_listing to actually open a result.',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string', description: 'The search query.' } },
    required: ['query'],
  },
  execute: (input: SearchWebInput) => searchWeb(input.query),
} satisfies ToolDefinition<SearchWebInput, WebSearchResult[]>;

export const searchImagesTool = {
  name: 'search_images',
  description:
    'Searches the web for images and returns image URLs, thumbnails, titles, and source pages. Use this before asking the user to choose an image or setting a wallpaper.',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string', description: 'The image search query.' } },
    required: ['query'],
  },
  execute: (input: SearchImagesInput) => searchImages(input.query),
} satisfies ToolDefinition<SearchImagesInput, ImageSearchResult[]>;

export const setWallpaperTool = {
  name: 'set_wallpaper',
  description:
    'Sets a user-selected image as the Android home screen, lock screen, or both wallpapers. Requires an image URL or local content/file URI and explicit user confirmation before execution.',
  parameters: {
    type: 'object',
    properties: {
      imageUri: { type: 'string', description: 'HTTPS image URL or local Android content/file URI.' },
      target: { type: 'string', description: 'Where to apply it: home, lock, or both.' },
    },
    required: ['imageUri', 'target'],
  },
  execute: (input: SetWallpaperInput) => getWallpaperModule().setWallpaper(input.imageUri, input.target),
} satisfies ToolDefinition<SetWallpaperInput, SetWallpaperResult>;

export const browseForImageTool = {
  name: 'browse_for_image',
  description:
    'Opens a web page in the AI-OS-owned browser. The user can browse and tap an image; returns the selected image URL. Use when structured image search is insufficient.',
  parameters: {
    type: 'object',
    properties: { url: { type: 'string', description: 'HTTPS page URL to open in the AI-OS image browser.' } },
    required: ['url'],
  },
  execute: (input: BrowseForImageInput) => getImageBrowserModule().browseForImage(input.url),
} satisfies ToolDefinition<BrowseForImageInput, BrowseForImageResult>;

export const openUrlExternalTool = {
  name: 'open_url_external',
  description: 'Opens an HTTPS URL in the device default browser, such as Chrome. AI-OS cannot observe selections made there.',
  parameters: {
    type: 'object',
    properties: { url: { type: 'string', description: 'HTTPS URL to open externally.' } },
    required: ['url'],
  },
  execute: (input: OpenUrlInput) => getDeepLinkModule().openUri(input.url),
} satisfies ToolDefinition<OpenUrlInput, OpenUriResult>;

export const openUrlInAiosBrowserTool = {
  name: 'open_url_in_aios_browser',
  description: 'Opens an HTTPS URL in the AI-OS-owned browser surface. AI-OS can observe navigation, but the user must close it to continue the workflow.',
  parameters: {
    type: 'object',
    properties: { url: { type: 'string', description: 'HTTPS URL to open inside AI-OS.' } },
    required: ['url'],
  },
  execute: (input: OpenUrlInput) => getImageBrowserModule().openUrlInAiosBrowser(input.url),
} satisfies ToolDefinition<OpenUrlInput, OpenAiosBrowserResult>;

export const listLearnedProceduresTool = {
  name: 'list_learned_procedures',
  description: 'Lists approved learned phone-use procedures. Use this before replaying a learned app workflow.',
  parameters: { type: 'object', properties: {}, required: [] },
  execute: () => listLearnedProcedures(),
} satisfies ToolDefinition<Record<string, never>, unknown>;

function hasStableReplaySelector(args: Record<string, unknown>) {
  const resourceId = String(args.resourceId ?? '');
  const contentDescription = String(args.contentDescription ?? '');
  const text = String(args.text ?? '');
  const fieldKey = String(args.fieldKey ?? '');
  return Boolean(resourceId || contentDescription || (fieldKey && fieldKey !== text));
}

function procedureHasRealReplayAction(procedure: { steps: Array<{ arguments?: Record<string, unknown> }> }) {
  return procedure.steps.some((step) => {
    const action = String(step.arguments?.action ?? '');
    return (action === 'tap' || action === 'text_input') && hasStableReplaySelector(step.arguments ?? {});
  });
}

function replaySelectorDiagnostics(procedure: { steps: Array<{ arguments?: Record<string, unknown> }> }) {
  return procedure.steps.map((step, index) => {
    const args = step.arguments ?? {};
    const action = String(args.action ?? '');
    const text = String(args.text ?? '');
    const fieldKey = String(args.fieldKey ?? '');
    return {
      step: index + 1,
      action,
      selectorKind: String(args.selectorKind ?? ''),
      hasResourceId: Boolean(args.resourceId),
      hasContentDescription: Boolean(args.contentDescription),
      hasDistinctFieldKey: Boolean(fieldKey && fieldKey !== text),
      text: text.slice(0, 80),
      fieldKey: fieldKey.slice(0, 80),
    };
  });
}

export const replayLearnedProcedureTool = {
  name: 'replay_learned_procedure',
  description: 'Replays an approved learned phone-use procedure through AccessibilityService. Provide one-time runtimeValues for fields that must be typed, such as pickup and destination. For ride-hailing, call get_current_location first when pickup is "here" and pass that location as the pickup runtime value. Never use this for booking, payment, or final submission without a separate user confirmation.',
  parameters: {
    type: 'object',
    properties: {
      procedureId: { type: 'number', description: 'ID returned by list_learned_procedures.' },
      runtimeValues: { type: 'object', description: 'One-time values keyed by recorded resource ID, content description, field key, or visible field label. Example: {"com.safeboda:id/pickup":"0.3476,32.5825","com.safeboda:id/destination":"Acacia Mall"}. These values are not saved.' },
      completionSelector: { type: 'object', description: 'Optional selector proving the task completed, using a resourceId or visible text.' },
    },
    required: ['procedureId'],
  },
  execute: async (input: ReplayLearnedProcedureInput) => {
    const traceId = `replay-${input.procedureId}-${Date.now()}`;
    const procedures = await listLearnedProcedures();
    const selectedProcedure = procedures.find((candidate) => candidate.id === input.procedureId);
    if (!selectedProcedure) throw new Error(`Learned procedure ${input.procedureId} was not found.`);
    if (selectedProcedure.state !== 'approved') throw new Error('Only approved learned procedures can be replayed.');
    if (!procedureHasRealReplayAction(selectedProcedure)) {
      const details = {
        requestedProcedureId: selectedProcedure.id,
        requestedIntent: selectedProcedure.intent,
        requestedScope: selectedProcedure.scope,
        requestedActions: selectedProcedure.steps.map((step) => String(step.arguments?.action ?? '')),
        selectorDiagnostics: replaySelectorDiagnostics(selectedProcedure),
        reason: 'selected_procedure_has_no_stable_replay_selector',
      };
      await recordDebugEvents([{
        traceId,
        flow: 'replay',
        event: 'procedure_rejected',
        level: 'error',
        procedureId: selectedProcedure.id,
        details,
      }]).catch(() => undefined);
      throw new Error(`Learned procedure ${selectedProcedure.id} cannot replay yet: it has no stable tap or text-input selector. Reteach it, then inspect procedure_rejected debug details.`);
    }
    const procedure = selectedProcedure;
    await recordDebugEvents([{
      traceId,
      flow: 'replay',
      event: 'procedure_selected',
      level: 'info',
      procedureId: procedure.id,
      details: {
        requestedProcedureId: selectedProcedure.id,
        selectedProcedureId: procedure.id,
        fallbackUsed: false,
        requestedIntent: selectedProcedure.intent,
        selectedIntent: procedure.intent,
        requestedActions: selectedProcedure.steps.map((step) => String(step.arguments?.action ?? '')),
        selectedActions: procedure.steps.map((step) => String(step.arguments?.action ?? '')),
        reason: 'selected_exact_procedure_is_replayable',
      },
    }]).catch(() => undefined);
    const targetSurface = procedure.scope && procedure.scope !== 'local' && procedure.scope.includes('.') ? procedure.scope : undefined;
    const result = await replayLearningActions(procedure.steps.map((step) => step.arguments ?? {}), input.runtimeValues ?? {}, input.completionSelector, targetSurface);
    await recordDebugEvents((result.trace ?? []).map((event) => ({
      traceId,
      flow: 'replay',
      event: String(event.event ?? 'native_replay_event'),
      level: String(event.level ?? 'info'),
      procedureId: procedure.id,
      step: typeof event.step === 'number' ? event.step : undefined,
      details: typeof event.details === 'object' && event.details !== null ? event.details as Record<string, unknown> : {},
    }))).catch(() => undefined);
    return {
      requestedProcedureId: selectedProcedure.id,
      procedureId: procedure.id,
      intent: procedure.intent,
      replayFallbackUsed: false,
      ...result,
      requiresManualConfirmation: result.skipped > 0 || result.verified === 0,
    };
  },
} satisfies ToolDefinition<ReplayLearnedProcedureInput, unknown>;

// Registry of all capabilities. The future LLM planner inspects this list
// before choosing a tool, so keep names/descriptions/parameters accurate.
export const tools: ToolDefinition<any, any>[] = [
  getInstalledAppsTool,
  openApplicationTool,
  getDeviceInfoTool,
  getStorageInfoTool,
  diagnoseNetworkTool,
  runNetworkTestTool,
  openWifiSettingsTool,
  openNetworkSettingsTool,
  diagnoseBatteryTool,
  getAppUsageTool,
  openAppBatterySettingsTool,
  getBatteryOptimizationStatusTool,
  openBatteryOptimizationSettingsTool,
  findStorageCandidatesTool,
  deleteStorageCandidatesTool,
  getDevicePolicyStatusTool,
  setApplicationSuspendedTool,
  setApplicationsSuspendedTool,
  setKioskModeTool,
  startFocusPolicyTool,
  getFocusPolicyStatusTool,
  stopFocusPolicyTool,
  setAlarmTool,
  scheduleDateAlarmTool,
  inspectAppHealthTool,
  openAppSettingsTool,
  getUpcomingEventsTool,
  connectGoogleAccountTool,
  searchGmailTool,
  readGmailTool,
  searchDriveTool,
  readDriveTool,
  getGoogleCalendarUpcomingTool,
  createGmailDraftTool,
  createGoogleCalendarEventTool,
  getMonthlyFinancesTool,
  extractReceiptTool,
  getRecentSmsTool,
  analyzeSmsFinancesTool,
  analyzeFinancesTool,
  getCurrentLocationTool,
  getContactsTool,
  adjustVolumeTool,
  searchYoutubeTool,
  openWebSearchTool,
  navigateMapsTool,
  openPlayStoreListingTool,
  sendSmsTool,
  makeCallTool,
  setScreenBrightnessTool,
  takePhotoTool,
  recordVideoTool,
  searchWebTool,
  searchImagesTool,
  setWallpaperTool,
  browseForImageTool,
  openUrlExternalTool,
  openUrlInAiosBrowserTool,
  listLearnedProceduresTool,
  replayLearnedProcedureTool,
];
