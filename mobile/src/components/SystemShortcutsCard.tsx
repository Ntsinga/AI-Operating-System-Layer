import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { openWifiSettingsTool, openNetworkSettingsTool, openBatteryOptimizationSettingsTool } from '../tools/registry';
import { colors } from '../theme';
import { GradientButton } from './GradientButton';

const SHORTCUTS = [
  { key: 'wifi', label: 'Wi-Fi settings', tool: openWifiSettingsTool },
  { key: 'network', label: 'Network settings', tool: openNetworkSettingsTool },
  { key: 'battery', label: 'Battery optimization', tool: openBatteryOptimizationSettingsTool },
] as const;

// One-tap launchers into Android's own settings screens - no diagnostic readouts here, since
// those duplicate what's already visible in the status bar/Settings app and only the AI planner
// benefits from querying that state directly (see registry.ts's diagnose_network/diagnose_battery).
export function SystemShortcutsCard() {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, execute: () => Promise<unknown>) {
    setPending(key); setError(null);
    try { await execute(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not open that settings screen.'); }
    finally { setPending(null); }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>System shortcuts</Text>
      <Text style={styles.description}>Jump straight into the relevant Android settings screen.</Text>
      <View style={styles.row}>
        {SHORTCUTS.map(({ key, label, tool }) => (
          <GradientButton
            key={key}
            label={pending === key ? 'Opening...' : label}
            disabled={pending !== null}
            onPress={() => void run(key, () => tool.execute())}
            style={styles.button}
          />
        ))}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, marginBottom: 16, padding: 16 },
  title: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  description: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 12, marginTop: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { flexBasis: '31%', flexGrow: 1 },
  error: { color: colors.dangerText, marginTop: 10 },
});
