import { ScrollView, StyleSheet, Text } from 'react-native';

import { ActivationSetupCard } from '../components/ActivationSetupCard';
import { HandednessCard } from '../components/HandednessCard';
import { OverlayControlCard } from '../components/OverlayControlCard';
import { LatestBriefCard } from '../components/LatestBriefCard';
import { ExpenseDashboardCard } from '../components/ExpenseDashboardCard';
import { LearnedProceduresCard } from '../components/LearnedProceduresCard';
import { LearningModeCard } from '../components/LearningModeCard';
import { colors } from '../theme';

function SectionHeader({ label }: { label: string }) {
  return <Text style={styles.sectionHeader}>{label}</Text>;
}

// The Settings screen, opened from the Home header (it was the second bottom tab until the Home
// launcher screen replaced tab navigation; before that it was called "Tools" - renamed once the
// audit below left only assistant controls, passive insights, and the teach/replay pair, none of
// which read as "tools" anymore). Chat is no longer a tab: it is the sheet raised from the Home
// ask bar, so the "Chat tab" mentioned in the notes below means that chat.
// Only capabilities that genuinely beat doing the same thing on the phone directly.
// Deliberately does NOT include every tool in tools/registry.ts:
// - Read-only diagnostics (get_device_info, diagnose_network, get_contacts, etc.) and
//   OS-duplicating controls (adjust_volume, set_screen_brightness, set_alarm,
//   get_upcoming_events, open_app_settings, find_storage_candidates - Device Care already has a
//   one-tap cleaner) - the phone's own apps/Quick Settings already cover these in fewer taps.
// - "Type something here, then get redirected to the real app anyway" tools (search_youtube,
//   navigate_maps, open_play_store_listing, search_web, open_url_external/in_aios_browser, the
//   Wi-Fi/network/battery settings shortcuts) - a bare text field in AI-OS is never faster or
//   better than the destination app's own native search/autocomplete/suggestions.
// - search_images/set_wallpaper (was ImageSearchCard here) - this is a conversational task
//   ("find me wallpaper options for X, set the second one"), not a form. WorkflowCard.tsx (Chat
//   tab) already renders search_images results as a tappable thumbnail grid inline and feeds the
//   pick back into the workflow, which follows up with set_wallpaper - no separate card needed.
// All of the above stay planner-only, reachable from the Chat tab (and, once voice lands, by
// asking directly - "set an alarm for 7", "navigate to the airport") instead of cluttering this
// screen. See PROGRESS.md for the 2026-07-29 audit that drove this list down from ~29 entries.
//
// GoalGuardCard is also intentionally absent: it requires AI-OS to be Device Owner, which
// Android only allows on a device with zero accounts/user profiles - i.e. immediately after a
// factory reset, before signing into anything. That's unreachable on a real daily-driver phone
// (verified: `adb shell dpm set-device-owner` fails here with "already several users on the
// device"), so it stays in the codebase for dedicated test-device use but off this screen.
type Props = {
  leftHanded: boolean;
  onLeftHandedChange: (leftHanded: boolean) => void;
};

export function SettingsScreen({ leftHanded, onLeftHandedChange }: Props) {
  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <SectionHeader label="Layout" />
      <HandednessCard leftHanded={leftHanded} onChange={onLeftHandedChange} />

      <SectionHeader label="Assistant" />
      <ActivationSetupCard />
      <OverlayControlCard />

      <SectionHeader label="Insights" />
      <LatestBriefCard />
      <ExpenseDashboardCard />

      <SectionHeader label="Teach & replay" />
      <LearningModeCard />
      <LearnedProceduresCard />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 24,
  },
  sectionHeader: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 4,
    textTransform: 'uppercase',
  },
});
