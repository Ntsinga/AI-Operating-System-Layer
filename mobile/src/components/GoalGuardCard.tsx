import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { getAppManager, type InstalledApp } from '../native/AppManager';
import { getDevicePolicyModule, type DevicePolicyStatus } from '../native/DevicePolicy';
import { getFocusPolicyModule, type FocusPolicyStatus } from '../native/FocusPolicy';
import { colors } from '../theme';
import { GradientButton } from './GradientButton';

/**
 * First Goal Guard vertical slice. Device Owner is deliberately required for
 * enforcement; a normal app must not pretend that a policy is active.
 */
export function GoalGuardCard() {
  const [goal, setGoal] = useState('Finish my study task');
  const [duration, setDuration] = useState('120');
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [selectedPackages, setSelectedPackages] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<DevicePolicyStatus | null>(null);
  const [focusStatus, setFocusStatus] = useState<FocusPolicyStatus | null>(null);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const packageList = () => [...selectedPackages];

  // Device Owner is required for real enforcement, but the old flow only surfaced that after a
  // user filled in a goal, a duration, picked apps, and tapped Start - checking silently on
  // mount means the "this won't actually block anything yet" notice shows before they invest
  // time in the form, not after.
  useEffect(() => { void refreshStatus(); }, []);

  async function loadApps() {
    setError(null); setBusy(true);
    try { setApps((await getAppManager().getInstalledApps()).filter((app) => app.launchable)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load installed apps.'); }
    finally { setBusy(false); }
  }

  function toggleApp(packageName: string) {
    setSelectedPackages((current) => {
      const next = new Set(current);
      if (next.has(packageName)) next.delete(packageName); else next.add(packageName);
      return next;
    });
  }

  async function refreshStatus() {
    setError(null);
    try { setStatus(await getDevicePolicyModule().getPolicyStatus()); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not read device policy status.'); }
  }

  async function startGoal() {
    const blocked = packageList();
    if (!goal.trim() || blocked.length === 0) { setError('Enter a goal and select at least one app to block.'); return; }
    setBusy(true); setError(null);
    try {
      const policy = await getDevicePolicyModule().getPolicyStatus();
      setStatus(policy);
      if (!policy.deviceOwner) {
        setError('Goal Guard enforcement requires AI-OS to be provisioned as Device Owner on this test device.');
        return;
      }
      const minutes = Number(duration);
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 10080) throw new Error('Duration must be 1 to 10080 minutes.');
      const result = await getFocusPolicyModule().startFocus(blocked, minutes);
      setFocusStatus({ active: result.active, packageNames: result.packageNames ?? blocked, unlockAtEpochMs: result.unlockAtEpochMs ?? 0 });
      setActive(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not start Goal Guard.'); }
    finally { setBusy(false); }
  }

  function completeGoal() {
    Alert.alert('Complete goal?', `This will restore ${packageList().length} blocked app(s).`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unlock apps', onPress: () => { void restoreApps(); } },
    ]);
  }

  async function restoreApps() {
    setBusy(true); setError(null);
    try {
      await getFocusPolicyModule().stopFocus();
      setFocusStatus(null);
      setActive(false);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not restore blocked apps.'); }
    finally { setBusy(false); }
  }

  return <View style={styles.card}>
    <Text style={styles.name}>Goal Guard</Text>
    <Text style={styles.description}>Block selected apps while you complete a goal. Enforcement requires AI-OS Device Owner mode.</Text>
    {status && !status.deviceOwner ? (
      <Text style={styles.notice}>Device Owner is not active - starting a goal below will fail. Provision AI-OS as Device Owner first (see docs/AI_OS_TEST_GUIDE.md), then tap "Check Device Owner status" to confirm.</Text>
    ) : null}
    <TextInput style={styles.input} value={goal} onChangeText={setGoal} placeholder="Goal" placeholderTextColor={colors.textMuted} editable={!active && !busy} />
    <TextInput style={styles.input} value={duration} onChangeText={setDuration} placeholder="Block duration in minutes" placeholderTextColor={colors.textMuted} keyboardType="numeric" editable={!active && !busy} />
    <GradientButton label={busy ? 'Loading apps...' : 'Choose apps to block'} disabled={busy || active} onPress={() => void loadApps()} />
    {apps.length > 0 ? <Text style={styles.selectionHint}>{selectedPackages.size} app(s) selected</Text> : null}
    <ScrollView style={styles.appList} nestedScrollEnabled>
      {apps.map((app) => {
        const selected = selectedPackages.has(app.packageName);
        return <Pressable key={app.packageName} onPress={() => toggleApp(app.packageName)} disabled={active || busy} style={[styles.appRow, selected && styles.appRowSelected]}>
          <View style={[styles.checkbox, selected && styles.checkboxSelected]}><Text style={styles.check}>{selected ? '✓' : ''}</Text></View>
          <View style={styles.appText}><Text style={styles.appName}>{app.name}</Text></View>
        </Pressable>;
      })}
    </ScrollView>
    <GradientButton label={busy ? 'Working...' : active ? 'Goal active' : 'Start protected goal'} disabled={busy || active} onPress={() => void startGoal()} />
    {active ? <GradientButton label="I completed the goal — unlock apps" disabled={busy} onPress={completeGoal} style={styles.unlockButton} /> : null}
    <GradientButton label="Check Device Owner status" disabled={busy} onPress={() => void refreshStatus()} style={styles.statusButton} />
    {status ? <Text style={styles.status}>Mode: {status.mode} · Device Owner: {status.deviceOwner ? 'yes' : 'no'}</Text> : null}
    {focusStatus?.active ? <Text style={styles.status}>Automatic unlock: {new Date(focusStatus.unlockAtEpochMs).toLocaleString()}</Text> : null}
    {error ? <Text style={styles.error}>{error}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, marginBottom: 16, padding: 16 },
  name: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  description: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 12, marginTop: 6 },
  notice: { backgroundColor: colors.infoBg, borderColor: colors.infoBorder, borderRadius: 10, borderWidth: 1, color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginBottom: 12, padding: 10 },
  input: { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: 10, borderWidth: 1, color: colors.textPrimary, fontSize: 14, marginBottom: 10, minHeight: 46, paddingHorizontal: 12 },
  selectionHint: { color: colors.textSecondary, fontSize: 12, marginTop: 10 },
  appList: { gap: 8, marginTop: 8, maxHeight: 260 },
  appRow: { alignItems: 'center', backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: 10, borderWidth: 1, flexDirection: 'row', minHeight: 48, paddingHorizontal: 10 },
  appRowSelected: { backgroundColor: colors.positiveBg, borderColor: colors.positiveBorder },
  checkbox: { alignItems: 'center', borderColor: colors.borderStrong, borderRadius: 5, borderWidth: 1, height: 22, justifyContent: 'center', marginRight: 10, width: 22 },
  checkboxSelected: { backgroundColor: colors.positive, borderColor: colors.positive },
  check: { color: colors.background, fontWeight: '900' },
  appText: { flex: 1 },
  appName: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  unlockButton: { marginTop: 10 },
  statusButton: { marginTop: 10 },
  status: { color: colors.textSecondary, fontSize: 12, marginTop: 10 },
  error: { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder, borderRadius: 10, borderWidth: 1, color: colors.dangerText, fontSize: 13, lineHeight: 19, marginTop: 12, padding: 10 },
});
