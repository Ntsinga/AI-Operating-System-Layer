import { ScrollView, StyleSheet } from 'react-native';

import { AudioControlCard } from '../components/AudioControlCard';
import { InputToolCard } from '../components/InputToolCard';
import { ImageSearchCard } from '../components/ImageSearchCard';
import { JsonToolCard } from '../components/JsonToolCard';
import { OverlayControlCard } from '../components/OverlayControlCard';
import { StorageCleanupCard } from '../components/StorageCleanupCard';
import { GoalGuardCard } from '../components/GoalGuardCard';
import { LatestBriefCard } from '../components/LatestBriefCard';
import { ExpenseDashboardCard } from '../components/ExpenseDashboardCard';
import { ReceiptCaptureCard } from '../components/ReceiptCaptureCard';
import { LearnedProceduresCard } from '../components/LearnedProceduresCard';
import { LearningModeCard } from '../components/LearningModeCard';
import {
  getContactsTool,
  getCurrentLocationTool,
  getDeviceInfoTool,
  getStorageInfoTool,
  diagnoseNetworkTool,
  runNetworkTestTool,
  openWifiSettingsTool,
  openNetworkSettingsTool,
  diagnoseBatteryTool,
  getAppUsageTool,
  getBatteryOptimizationStatusTool,
  openBatteryOptimizationSettingsTool,
  getDevicePolicyStatusTool,
  findStorageCandidatesTool,
  makeCallTool,
  navigateMapsTool,
  openPlayStoreListingTool,
  openUrlExternalTool,
  openUrlInAiosBrowserTool,
  openWebSearchTool,
  searchWebTool,
  searchYoutubeTool,
  setWallpaperTool,
  sendSmsTool,
  setScreenBrightnessTool,
  setAlarmTool,
  inspectAppHealthTool,
  openAppSettingsTool,
  getUpcomingEventsTool,
  connectGoogleAccountTool,
} from '../tools/registry';

// take_photo/record_video are intentionally absent here: they now run from the overlay
// bubble's quick-action menu (OverlayService.kt) instead of a manual tool card, but they stay
// registered in tools/registry.ts so the AI planner can still call them.
const jsonTools = [getDeviceInfoTool, getStorageInfoTool, diagnoseNetworkTool, openWifiSettingsTool, openNetworkSettingsTool, diagnoseBatteryTool, getDevicePolicyStatusTool, openBatteryOptimizationSettingsTool, connectGoogleAccountTool, getCurrentLocationTool, getContactsTool];

// The "Tools" tab: every individual capability as its own runnable card. The
// conversational assistant lives on the separate Chat tab.
export function ToolsScreen() {
  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <OverlayControlCard />
      <AudioControlCard />
      <ImageSearchCard />
      <StorageCleanupCard />
      <GoalGuardCard />
      <LatestBriefCard />
      <ExpenseDashboardCard />
      <ReceiptCaptureCard />
      <LearnedProceduresCard />
      <LearningModeCard />

      <InputToolCard tool={searchYoutubeTool} fields={[{ key: 'query', label: 'Search YouTube for...' }]} />
      <InputToolCard tool={openWebSearchTool} fields={[{ key: 'query', label: 'Search the web for...' }]} />
      <InputToolCard tool={openUrlExternalTool} fields={[{ key: 'url', label: 'HTTPS URL to open externally' }]} />
      <InputToolCard tool={openUrlInAiosBrowserTool} fields={[{ key: 'url', label: 'HTTPS URL to open in AI-OS' }]} />
      <InputToolCard tool={navigateMapsTool} fields={[{ key: 'destination', label: 'Navigate to...' }]} />
      <InputToolCard
        tool={openPlayStoreListingTool}
        fields={[{ key: 'query', label: 'Search Play Store for an app...' }]}
      />
      <InputToolCard
        tool={sendSmsTool}
        fields={[
          { key: 'phoneNumber', label: 'Phone number' },
          { key: 'message', label: 'Message' },
        ]}
      />
      <InputToolCard tool={makeCallTool} fields={[{ key: 'phoneNumber', label: 'Phone number' }]} />
      <InputToolCard
        tool={setScreenBrightnessTool}
        fields={[{ key: 'level', label: 'Brightness 0-255', numeric: true }]}
      />
      <InputToolCard tool={searchWebTool} fields={[{ key: 'query', label: 'Search query' }]} />
      <InputToolCard tool={getAppUsageTool} fields={[{ key: 'hours', label: 'Usage lookback hours (1-168)', numeric: true }]} />
      <InputToolCard tool={getBatteryOptimizationStatusTool} fields={[{ key: 'packageName', label: 'Search installed apps', appPicker: true }]} />
      <InputToolCard tool={inspectAppHealthTool} fields={[{ key: 'packageName', label: 'Search installed apps', appPicker: true }]} />
      <InputToolCard tool={openAppSettingsTool} fields={[{ key: 'packageName', label: 'Search installed apps', appPicker: true }]} />
      <InputToolCard tool={getUpcomingEventsTool} fields={[{ key: 'hours', label: 'Calendar lookahead hours (1-168)', numeric: true }]} />
      <InputToolCard tool={runNetworkTestTool} fields={[{ key: 'samples', label: 'Network probes (1-5)', numeric: true }]} />
      <InputToolCard tool={setAlarmTool} fields={[{ key: 'hour', label: 'Hour (0-23)', numeric: true }, { key: 'minute', label: 'Minute (0-59)', numeric: true }, { key: 'label', label: 'Alarm label' }]} />
      <InputToolCard
        tool={setWallpaperTool}
        fields={[
          { key: 'imageUri', label: 'Image URL or local URI' },
          { key: 'target', label: 'Target: home, lock, or both' },
        ]}
      />

      {jsonTools.map((tool) => (
        <JsonToolCard key={tool.name} tool={tool} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 24,
  },
});
