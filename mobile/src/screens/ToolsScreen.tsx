import { ScrollView, StyleSheet } from 'react-native';

import { InputToolCard } from '../components/InputToolCard';
import { ImageSearchCard } from '../components/ImageSearchCard';
import { OpenUrlCard } from '../components/OpenUrlCard';
import { OverlayControlCard } from '../components/OverlayControlCard';
import { StorageCleanupCard } from '../components/StorageCleanupCard';
import { SystemShortcutsCard } from '../components/SystemShortcutsCard';
import { WebSearchCard } from '../components/WebSearchCard';
import { GoalGuardCard } from '../components/GoalGuardCard';
import { LatestBriefCard } from '../components/LatestBriefCard';
import { ExpenseDashboardCard } from '../components/ExpenseDashboardCard';
import { LearnedProceduresCard } from '../components/LearnedProceduresCard';
import { LearningModeCard } from '../components/LearningModeCard';
import {
  navigateMapsTool,
  openPlayStoreListingTool,
  searchYoutubeTool,
  setAlarmTool,
  openAppSettingsTool,
  getUpcomingEventsTool,
} from '../tools/registry';

// The "Tools" tab: every capability worth a manual UI. Deliberately does NOT include every tool
// in tools/registry.ts - read-only diagnostics (get_device_info, diagnose_network, get_contacts,
// etc.), OS-duplicating controls (adjust_volume, set_screen_brightness), and typed forms that
// are worse than the phone's own app (make_call, send_sms) stay planner-only, reachable from the
// Chat tab, instead of cluttering this screen. See PROGRESS.md for the 2026-07-29 audit that
// drove this list down from ~29 entries to this set.
export function ToolsScreen() {
  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <OverlayControlCard />
      <ImageSearchCard />
      <StorageCleanupCard />
      <GoalGuardCard />
      <LatestBriefCard />
      <ExpenseDashboardCard />
      <LearnedProceduresCard />
      <LearningModeCard />
      <SystemShortcutsCard />
      <OpenUrlCard />
      <WebSearchCard />

      <InputToolCard tool={searchYoutubeTool} fields={[{ key: 'query', label: 'Search YouTube for...' }]} />
      <InputToolCard tool={navigateMapsTool} fields={[{ key: 'destination', label: 'Navigate to...' }]} />
      <InputToolCard tool={openPlayStoreListingTool} fields={[{ key: 'query', label: 'Search Play Store for an app...' }]} />
      <InputToolCard tool={openAppSettingsTool} fields={[{ key: 'packageName', label: 'Search installed apps', appPicker: true }]} />
      <InputToolCard tool={getUpcomingEventsTool} fields={[{ key: 'hours', label: 'Calendar lookahead hours (1-168)', numeric: true }]} />
      <InputToolCard
        tool={setAlarmTool}
        fields={[
          { key: 'hour', label: 'Hour (0-23)', numeric: true },
          { key: 'minute', label: 'Minute (0-59)', numeric: true },
          { key: 'label', label: 'Alarm label' },
        ]}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 24,
  },
});
