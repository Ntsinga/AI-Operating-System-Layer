import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { approveLearnedProcedure, deleteLearnedProcedure, listLearnedProcedures, recordDebugEvents } from '../planner/learningClient';
import { openAccessibilitySettings, replayLearningActions } from '../native/LearningWatcher';
import { getAppManager } from '../native/AppManager';
import { colors } from '../theme';

type Procedure = { id: number; intent: string; steps: Array<{ arguments?: Record<string, unknown> }>; outcome: string; scope: string; version: number; state: string; createdAt: string };

function hasRealReplayAction(procedure: Procedure) {
  return procedure.steps.some((step) => ['tap', 'text_input'].includes(String(step.arguments?.action ?? '')));
}

function chooseReplayProcedure(selected: Procedure, procedures: Procedure[]) {
  if (hasRealReplayAction(selected)) return selected;
  return procedures
    .filter((candidate) => candidate.state === 'approved' && candidate.scope === selected.scope && hasRealReplayAction(candidate))
    .sort((left, right) => {
      const rightActions = right.steps.filter((step) => ['tap', 'text_input'].includes(String(step.arguments?.action ?? ''))).length;
      const leftActions = left.steps.filter((step) => ['tap', 'text_input'].includes(String(step.arguments?.action ?? ''))).length;
      return rightActions - leftActions || right.id - left.id;
    })[0] ?? selected;
}

export function LearnedProceduresCard() {
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [runtimeValues, setRuntimeValues] = useState('{}');

  const refresh = useCallback(async () => {
    try { setProcedures(await listLearnedProcedures()); setError(null); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Could not load learned procedures.'); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function remove(id: number) {
    try { await deleteLearnedProcedure(id); await refresh(); }
    catch (deleteError) { setError(deleteError instanceof Error ? deleteError.message : 'Could not delete procedure.'); }
  }
  async function approve(id: number) {
    try { await approveLearnedProcedure(id); await refresh(); }
    catch (approveError) { setError(approveError instanceof Error ? approveError.message : 'Could not approve procedure.'); }
  }
  async function replay(procedure: Procedure) {
    const selectedProcedure = procedure;
    procedure = chooseReplayProcedure(selectedProcedure, procedures);
    const traceId = `replay-${procedure.id}-${Date.now()}`;
    try {
      const values = JSON.parse(runtimeValues) as Record<string, string>;
      if (procedure.scope && procedure.scope !== 'local' && procedure.scope.includes('.')) {
        await getAppManager().openApplication(procedure.scope);
        await new Promise((resolve) => setTimeout(resolve, 1800));
      }
      const result = await replayLearningActions(procedure.steps.map((step) => step.arguments ?? {}), values);
      await recordDebugEvents((result.trace ?? []).map((event) => ({
        traceId,
        flow: 'replay',
        event: String(event.event ?? 'native_replay_event'),
        level: String(event.level ?? 'info'),
        procedureId: procedure.id,
        step: typeof event.step === 'number' ? event.step : undefined,
        details: typeof event.details === 'object' && event.details !== null ? event.details as Record<string, unknown> : {},
      }))).catch(() => undefined);
      setError(`Replay complete: ${result.executed} actions executed, ${result.skipped} skipped.${procedure.id !== selectedProcedure.id ? ` Used better procedure ${procedure.id} instead of scroll-only procedure ${selectedProcedure.id}.` : ''} Runtime text values were supplied only for this replay.`);
    } catch (replayError) {
      await recordDebugEvents([{
        traceId,
        flow: 'replay',
        event: 'replay_error',
        level: 'error',
        procedureId: procedure.id,
        details: { reason: replayError instanceof Error ? replayError.message : 'Enable Accessibility to replay.' },
      }]).catch(() => undefined);
      setError(replayError instanceof Error ? replayError.message : 'Enable Accessibility to replay.');
      await openAccessibilitySettings().catch(() => undefined);
    }
  }

  return <View style={styles.card}>
    <Text style={styles.title}>Learned procedures</Text>
    <Text style={styles.description}>Review or delete what AI-OS has learned. No screenshots or tool results are stored.</Text>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <TextInput style={styles.valuesInput} value={runtimeValues} onChangeText={setRuntimeValues} placeholder='Runtime text values, e.g. {"com.safeboda:id/destination":"Home"}' placeholderTextColor={colors.textMuted} autoCapitalize="none" />
    {procedures.length === 0 ? <Text style={styles.empty}>No procedures saved yet.</Text> : procedures.slice(0, 10).map((procedure) => (
      <View key={procedure.id} style={styles.row}>
        <View style={styles.copy}><Text style={styles.intent} numberOfLines={2}>{procedure.intent}</Text><Text style={styles.meta}>v{procedure.version} · {procedure.state} · {procedure.outcome} · {procedure.scope}</Text></View>
        {procedure.state === 'draft' ? <Pressable onPress={() => void approve(procedure.id)} style={styles.approve}><Text style={styles.approveText}>Approve</Text></Pressable> : <Pressable onPress={() => void replay(procedure)} style={styles.replay}><Text style={styles.replayText}>Replay</Text></Pressable>}
        <Pressable onPress={() => void remove(procedure.id)} style={styles.delete}><Text style={styles.deleteText}>Delete</Text></Pressable>
      </View>
    ))}
    <Pressable onPress={() => void refresh()} style={styles.refresh}><Text style={styles.refreshText}>Refresh</Text></Pressable>
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, marginBottom: 14, padding: 14 },
  title: { color: colors.textPrimary, fontSize: 17, fontWeight: '800' },
  description: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 5 },
  empty: { color: colors.textMuted, fontSize: 13, marginTop: 12 },
  error: { color: colors.dangerText, fontSize: 12, marginTop: 8 },
  row: { alignItems: 'center', borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', gap: 10, marginTop: 10, paddingTop: 10 },
  copy: { flex: 1 }, intent: { color: colors.textPrimary, fontSize: 13 }, meta: { color: colors.textMuted, fontSize: 11, marginTop: 3 },
  delete: { borderColor: colors.dangerBorder, borderRadius: 8, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 7 }, deleteText: { color: colors.dangerText, fontSize: 12 },
  approve: { borderColor: colors.positiveBorder, borderRadius: 8, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 7 }, approveText: { color: colors.positive, fontSize: 12 },
  replay: { borderColor: colors.borderStrong, borderRadius: 8, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 7 }, replayText: { color: colors.accent, fontSize: 12 },
  valuesInput: { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: 8, borderWidth: 1, color: colors.textPrimary, fontSize: 11, marginTop: 10, padding: 9 },
  refresh: { alignSelf: 'flex-start', marginTop: 12 }, refreshText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
});
