import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { appendLearningAction, completeLearningSession, startLearningSession } from '../planner/learningClient';
import { drainLearningActions, openAccessibilitySettings, setLearningRecording } from '../native/LearningWatcher';
import { colors } from '../theme';

export function LearningModeCard() {
  const [intent, setIntent] = useState(''); const [appPackage, setAppPackage] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null); const [count, setCount] = useState(0); const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);
  async function start() {
    if (!intent.trim()) return; const session = await startLearningSession(intent.trim(), appPackage.trim() || undefined); setSessionId(session.sessionId); setCount(0); setMessage('Enable AI-OS in Accessibility settings, then perform the task in the target app.');
    await openAccessibilitySettings(); await setLearningRecording(true);
    timer.current = setInterval(async () => { const actions = await drainLearningActions(); for (const action of actions) { await appendLearningAction(session.sessionId, action); setCount((value) => value + 1); } }, 800);
  }
  async function stop() {
    if (!sessionId) return; if (timer.current) clearInterval(timer.current); timer.current = null; await setLearningRecording(false); const result = await completeLearningSession(sessionId); setMessage(`Learned ${result.actions.length} semantic actions. Review it before reuse.`); setSessionId(null);
  }
  return <View style={styles.card}><Text style={styles.title}>Teach AI-OS a task</Text><Text style={styles.description}>AI-OS watches semantic UI events only after you enable Accessibility access. It does not capture screenshots or passwords.</Text>
    {!sessionId ? <><TextInput style={styles.input} placeholder="What should AI learn?" placeholderTextColor={colors.textMuted} value={intent} onChangeText={setIntent}/><TextInput style={styles.input} placeholder="Target app package (optional)" placeholderTextColor={colors.textMuted} value={appPackage} onChangeText={setAppPackage}/><Pressable style={styles.primary} onPress={() => void start()}><Text style={styles.primaryText}>Start teaching</Text></Pressable></> : <><Text style={styles.recording}>Recording semantic actions: {count}</Text><Pressable style={styles.stop} onPress={() => void stop()}><Text style={styles.stopText}>Finish teaching</Text></Pressable></>}
    {message ? <Text style={styles.message}>{message}</Text> : null}</View>;
}
const styles = StyleSheet.create({ card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, marginBottom: 14, padding: 14 }, title: { color: colors.textPrimary, fontSize: 17, fontWeight: '800' }, description: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 5 }, input: { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: 9, borderWidth: 1, color: colors.textPrimary, marginTop: 10, padding: 11 }, primary: { backgroundColor: colors.accent, borderRadius: 9, marginTop: 10, padding: 11 }, primaryText: { color: colors.onAccent, fontWeight: '800', textAlign: 'center' }, recording: { color: colors.positive, fontSize: 13, marginTop: 12 }, stop: { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder, borderRadius: 9, borderWidth: 1, marginTop: 10, padding: 11 }, stopText: { color: colors.dangerText, fontWeight: '800', textAlign: 'center' }, message: { color: colors.accent, fontSize: 12, lineHeight: 17, marginTop: 10 } });
