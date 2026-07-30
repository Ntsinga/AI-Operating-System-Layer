import { useEffect, useRef, useState } from 'react';
import { DeviceEventEmitter, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { appendLearningActionsBatch, completeLearningSession, startLearningSession, recordDebugEvents } from '../planner/learningClient';
import { clearLearningActions, openAccessibilitySettings, peekLearningActions, setLearningRecording } from '../native/LearningWatcher';
import { getAppManager, type InstalledApp } from '../native/AppManager';
import { colors } from '../theme';

export function LearningModeCard() {
  const [intent, setIntent] = useState(''); const [appQuery, setAppQuery] = useState(''); const [selectedApp, setSelectedApp] = useState<InstalledApp | null>(null); const [apps, setApps] = useState<InstalledApp[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null); const [count, setCount] = useState(0); const [message, setMessage] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeSessionId = useRef<string | null>(null);
  const startInFlight = useRef(false);
  const stopInFlight = useRef(false);
  const saveInFlight = useRef(false);
  useEffect(() => { getAppManager().getInstalledApps().then(setApps).catch(() => setApps([])); return () => { if (timer.current) clearInterval(timer.current); }; }, []);
  // Called both by the 800ms poll timer and directly by stop(). Without this guard, a poll tick
  // whose network round-trip outlasts 800ms (common against a cold-starting Render backend) can
  // overlap with the next tick (or with stop()'s own drain calls) - two concurrent callers both
  // read-append-write the same session's queue non-atomically on the backend, and one write can
  // silently clobber the other, losing captured taps with no error. See ERROR_LOG.md 2026-07-30
  // (a 45s Airbnb teach session recorded 60+ real taps but only 8 survived to the saved
  // procedure). Skipping (rather than queueing) an overlapping call is safe: the next tick 800ms
  // later picks up whatever accumulated in the meantime.
  async function saveQueuedActions(activeSessionId: string) {
    if (activeSessionId !== activeSessionIdRef.current) return 0;
    if (saveInFlight.current) return 0;
    saveInFlight.current = true;
    try {
      const actions = await peekLearningActions();
      if (activeSessionId !== activeSessionIdRef.current) return 0;
      if (actions.length > 0) {
        await appendLearningActionsBatch(activeSessionId, actions);
        await clearLearningActions();
        setCount((value) => value + actions.length);
      }
      return actions.length;
    } finally {
      saveInFlight.current = false;
    }
  }
  const activeSessionIdRef = activeSessionId;
  async function start() {
    if (!intent.trim() || !selectedApp || sessionId || activeSessionId.current || startInFlight.current) return;
    startInFlight.current = true;
    try {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
      setCount(0); setMessage(`Preparing to record ${selectedApp.name}...`);
      const session = await startLearningSession(intent.trim(), selectedApp.packageName);
      activeSessionId.current = session.sessionId;
      setSessionId(session.sessionId);
      await setLearningRecording(true, selectedApp.packageName);
      await recordDebugEvents([{
        traceId: session.sessionId,
        flow: 'learning',
        event: 'native_recording_enabled',
        sessionId: session.sessionId,
        details: { appPackage: selectedApp.packageName, intent: intent.trim() },
      }]).catch(() => undefined);
      setMessage(`Recording ${selectedApp.name}. Perform the task, then return here to finish.`);
      timer.current = setInterval(async () => { await saveQueuedActions(session.sessionId); }, 800);
      await getAppManager().openApplication(selectedApp.packageName);
    } catch (error) {
      activeSessionId.current = null;
      setSessionId(null);
      await setLearningRecording(false, undefined).catch(() => undefined);
      setMessage(error instanceof Error ? error.message : 'Could not start teaching. Enable Accessibility and try again.');
      await openAccessibilitySettings().catch(() => undefined);
    } finally {
      startInFlight.current = false;
    }
  }
  async function stop() {
    const finishingSessionId = activeSessionId.current ?? sessionId;
    if (!finishingSessionId || stopInFlight.current) return;
    stopInFlight.current = true;
    setFinishing(true);
    setMessage('Wrapping up - saving what was recorded...');
    try {
      if (timer.current) clearInterval(timer.current); timer.current = null;
      const drainedBeforeDisable = await saveQueuedActions(finishingSessionId);
      await setLearningRecording(false, undefined);
      const drainedAfterDisable = await saveQueuedActions(finishingSessionId);
      const drained = drainedBeforeDisable + drainedAfterDisable;
      const result = await completeLearningSession(finishingSessionId);
      DeviceEventEmitter.emit('aios.learning.procedureSaved', { sessionId: finishingSessionId, actionCount: result.actions.length });
      await recordDebugEvents([{
        traceId: finishingSessionId,
        flow: 'learning',
        event: 'native_recording_disabled',
        sessionId: finishingSessionId,
        details: { actionCount: result.actions.length, appPackage: selectedApp?.packageName },
      }]).catch(() => undefined);
      setMessage(`Learned ${result.actions.length} semantic actions. Review it before reuse.`);
      activeSessionId.current = null;
      setSessionId(null);
      if (drained === 0 && result.actions.length === 0) setMessage('No actions were captured. Enable Accessibility and make sure you perform the task inside the selected app.');
    } catch (error) {
      await setLearningRecording(false, undefined).catch(() => undefined);
      if (finishingSessionId) {
        await recordDebugEvents([{
          traceId: finishingSessionId,
          flow: 'learning',
          event: 'session_error',
          level: 'error',
          sessionId: finishingSessionId,
          details: { reason: error instanceof Error ? error.message : 'Could not finish teaching.' },
        }]).catch(() => undefined);
      }
      setMessage(error instanceof Error ? error.message : 'Could not finish teaching.');
      // Recording was already disabled above, so no more actions can ever be added to this
      // session - tapping "Finish teaching" again would just resubmit the identical request and
      // fail identically forever. Reset back to the start screen so the failure is visible and
      // the only available action (start a fresh teach) can actually succeed.
      activeSessionId.current = null;
      setSessionId(null);
    } finally {
      stopInFlight.current = false;
      setFinishing(false);
    }
  }
  const matches = apps.filter((app) => `${app.name} ${app.packageName}`.toLowerCase().includes(appQuery.trim().toLowerCase())).slice(0, 5);
  return <View style={styles.card}><Text style={styles.title}>Teach AI-OS a task</Text><Text style={styles.description}>Pick the app, then perform the task. AI-OS stores semantic UI actions only.</Text>
    {!sessionId ? <><TextInput style={styles.input} placeholder="What should AI learn?" placeholderTextColor={colors.textMuted} value={intent} onChangeText={setIntent}/><TextInput style={styles.input} placeholder="Search apps" placeholderTextColor={colors.textMuted} value={selectedApp ? selectedApp.name : appQuery} onFocus={() => setSelectedApp(null)} onChangeText={(value) => { setSelectedApp(null); setAppQuery(value); }}/>{selectedApp ? <Text style={styles.selected}>Selected: {selectedApp.name}</Text> : matches.map((app) => <Pressable key={app.packageName} style={styles.appRow} onPress={() => { setSelectedApp(app); setAppQuery(app.name); }}><Text style={styles.appName}>{app.name}</Text></Pressable>)}<Pressable style={[styles.primary, (!intent.trim() || !selectedApp) ? styles.disabled : null]} disabled={!intent.trim() || !selectedApp} onPress={() => void start()}><Text style={styles.primaryText}>Start teaching</Text></Pressable><Pressable style={styles.settingsLink} onPress={() => void openAccessibilitySettings()}><Text style={styles.settingsText}>Accessibility settings</Text></Pressable></> : <><Text style={styles.recording}>{finishing ? 'Wrapping up...' : `Recording semantic actions: ${count}`}</Text><Text style={styles.selected}>Target: {selectedApp?.name ?? 'selected app'}</Text><Pressable style={[styles.stop, finishing ? styles.disabled : null]} disabled={finishing} onPress={() => void stop()}><Text style={styles.stopText}>{finishing ? 'Wrapping up...' : 'Finish teaching'}</Text></Pressable></>}
    {message ? <Text style={styles.message}>{message}</Text> : null}</View>;
}
const styles = StyleSheet.create({ card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, marginBottom: 14, padding: 14 }, title: { color: colors.textPrimary, fontSize: 17, fontWeight: '800' }, description: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 5 }, input: { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: 9, borderWidth: 1, color: colors.textPrimary, marginTop: 10, padding: 11 }, appRow: { borderColor: colors.border, borderRadius: 9, borderWidth: 1, marginTop: 8, padding: 10 }, appName: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' }, appPackage: { color: colors.textMuted, fontSize: 11, marginTop: 2 }, selected: { color: colors.accent, fontSize: 12, marginTop: 8 }, primary: { backgroundColor: colors.accent, borderRadius: 9, marginTop: 10, padding: 11 }, disabled: { opacity: 0.45 }, primaryText: { color: colors.onAccent, fontWeight: '800', textAlign: 'center' }, settingsLink: { alignSelf: 'flex-start', marginTop: 10 }, settingsText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' }, recording: { color: colors.positive, fontSize: 13, marginTop: 12 }, stop: { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder, borderRadius: 9, borderWidth: 1, marginTop: 10, padding: 11 }, stopText: { color: colors.dangerText, fontWeight: '800', textAlign: 'center' }, message: { color: colors.accent, fontSize: 12, lineHeight: 17, marginTop: 10 } });
