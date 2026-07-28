import { useCallback, useEffect, useState } from 'react';
import { DeviceEventEmitter, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { openAccessibilitySettings, replayLearningActions } from '../native/LearningWatcher';
import { approveLearnedProcedure, deleteLearnedProcedure, listLearnedProcedures, recordDebugEvents } from '../planner/learningClient';
import { colors } from '../theme';

type Procedure = {
  id: number;
  intent: string;
  steps: Array<{ arguments?: Record<string, unknown> }>;
  outcome: string;
  scope: string;
  version: number;
  state: string;
  createdAt: string;
};

type BusyState = { id: number; action: 'approve' | 'delete' | 'replay' | 'refresh' };

export function LearnedProceduresCard() {
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [runtimeValues, setRuntimeValues] = useState('{}');
  const [busy, setBusy] = useState<BusyState | null>(null);

  const refresh = useCallback(async () => {
    try {
      setProcedures(await listLearnedProcedures());
      setStatus(null);
    } catch (loadError) {
      setStatus(loadError instanceof Error ? loadError.message : 'Could not load learned procedures.');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const subscription = DeviceEventEmitter.addListener('aios.learning.procedureSaved', () => {
      void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  async function remove(id: number) {
    if (busy) return;
    setBusy({ id, action: 'delete' });
    setStatus(`Deleting procedure ${id}...`);
    try {
      await deleteLearnedProcedure(id);
      await refresh();
      setStatus(`Deleted procedure ${id}.`);
    } catch (deleteError) {
      setStatus(deleteError instanceof Error ? deleteError.message : 'Could not delete procedure.');
    } finally {
      setBusy(null);
    }
  }

  async function approve(id: number) {
    if (busy) return;
    setBusy({ id, action: 'approve' });
    setStatus(`Approving procedure ${id}...`);
    try {
      await approveLearnedProcedure(id);
      await refresh();
      setStatus(`Approved procedure ${id}.`);
    } catch (approveError) {
      setStatus(approveError instanceof Error ? approveError.message : 'Could not approve procedure.');
    } finally {
      setBusy(null);
    }
  }

  async function replay(procedure: Procedure) {
    if (busy) return;
    const traceId = `replay-${procedure.id}-${Date.now()}`;
    setBusy({ id: procedure.id, action: 'replay' });
    setStatus(`Replaying procedure ${procedure.id}...`);
    try {
      const values = JSON.parse(runtimeValues) as Record<string, string>;
      await recordDebugEvents([{
        traceId,
        flow: 'replay',
        event: 'procedure_selected',
        level: 'info',
        procedureId: procedure.id,
        details: {
          requestedProcedureId: procedure.id,
          selectedProcedureId: procedure.id,
          fallbackUsed: false,
          requestedIntent: procedure.intent,
          selectedIntent: procedure.intent,
          requestedActions: procedure.steps.map((step) => String(step.arguments?.action ?? '')),
          selectedActions: procedure.steps.map((step) => String(step.arguments?.action ?? '')),
          reason: 'exact_user_selected_procedure',
        },
      }]).catch(() => undefined);
      const targetSurface = procedure.scope && procedure.scope !== 'local' && procedure.scope.includes('.') ? procedure.scope : undefined;
      const result = await replayLearningActions(procedure.steps.map((step) => step.arguments ?? {}), values, undefined, targetSurface);
      await recordDebugEvents((result.trace ?? []).map((event) => ({
        traceId,
        flow: 'replay',
        event: String(event.event ?? 'native_replay_event'),
        level: String(event.level ?? 'info'),
        procedureId: procedure.id,
        step: typeof event.step === 'number' ? event.step : undefined,
        details: typeof event.details === 'object' && event.details !== null ? event.details as Record<string, unknown> : {},
      }))).catch(() => undefined);
      setStatus(`Replay complete: ${result.executed} actions executed, ${result.skipped} skipped.`);
    } catch (replayError) {
      await recordDebugEvents([{
        traceId,
        flow: 'replay',
        event: 'replay_error',
        level: 'error',
        procedureId: procedure.id,
        details: { reason: replayError instanceof Error ? replayError.message : 'Enable Accessibility to replay.' },
      }]).catch(() => undefined);
      setStatus(replayError instanceof Error ? replayError.message : 'Enable Accessibility to replay.');
      await openAccessibilitySettings().catch(() => undefined);
    } finally {
      setBusy(null);
    }
  }

  async function refreshWithStatus() {
    if (busy) return;
    setBusy({ id: -1, action: 'refresh' });
    setStatus('Refreshing learned procedures...');
    try {
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Learned procedures</Text>
      <Text style={styles.description}>Review or delete what AI-OS has learned. No screenshots or tool results are stored.</Text>
      {status ? <Text style={styles.status}>{status}</Text> : null}
      <TextInput
        style={styles.valuesInput}
        value={runtimeValues}
        onChangeText={setRuntimeValues}
        placeholder='Runtime text values, e.g. {"com.safeboda:id/destination":"Home"}'
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
      />
      {procedures.length === 0 ? (
        <Text style={styles.empty}>No procedures saved yet.</Text>
      ) : procedures.slice(0, 10).map((procedure) => {
        const isBusy = busy?.id === procedure.id;
        return (
          <View key={procedure.id} style={styles.row}>
            <View style={styles.copy}>
              <Text style={styles.intent} numberOfLines={2}>{procedure.intent}</Text>
              <Text style={styles.meta}>v{procedure.version} · {procedure.state} · {procedure.outcome} · {procedure.scope}</Text>
            </View>
            {procedure.state === 'draft' ? (
              <Pressable disabled={Boolean(busy)} onPress={() => void approve(procedure.id)} style={[styles.approve, busy ? styles.disabled : null]}>
                <Text style={styles.approveText}>{isBusy && busy?.action === 'approve' ? 'Approving...' : 'Approve'}</Text>
              </Pressable>
            ) : (
              <Pressable disabled={Boolean(busy)} onPress={() => void replay(procedure)} style={[styles.replay, busy ? styles.disabled : null]}>
                <Text style={styles.replayText}>{isBusy && busy?.action === 'replay' ? 'Replaying...' : 'Replay'}</Text>
              </Pressable>
            )}
            <Pressable disabled={Boolean(busy)} onPress={() => void remove(procedure.id)} style={[styles.delete, busy ? styles.disabled : null]}>
              <Text style={styles.deleteText}>{isBusy && busy?.action === 'delete' ? 'Deleting...' : 'Delete'}</Text>
            </Pressable>
          </View>
        );
      })}
      <Pressable disabled={Boolean(busy)} onPress={() => void refreshWithStatus()} style={[styles.refresh, busy ? styles.disabled : null]}>
        <Text style={styles.refreshText}>{busy?.action === 'refresh' ? 'Refreshing...' : 'Refresh'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, marginBottom: 14, padding: 14 },
  title: { color: colors.textPrimary, fontSize: 17, fontWeight: '800' },
  description: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 5 },
  empty: { color: colors.textMuted, fontSize: 13, marginTop: 12 },
  status: { color: colors.accent, fontSize: 12, lineHeight: 17, marginTop: 8 },
  row: { alignItems: 'center', borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', gap: 10, marginTop: 10, paddingTop: 10 },
  copy: { flex: 1 },
  intent: { color: colors.textPrimary, fontSize: 13 },
  meta: { color: colors.textMuted, fontSize: 11, marginTop: 3 },
  delete: { borderColor: colors.dangerBorder, borderRadius: 8, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 7 },
  deleteText: { color: colors.dangerText, fontSize: 12 },
  approve: { borderColor: colors.positiveBorder, borderRadius: 8, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 7 },
  approveText: { color: colors.positive, fontSize: 12 },
  replay: { borderColor: colors.borderStrong, borderRadius: 8, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 7 },
  replayText: { color: colors.accent, fontSize: 12 },
  disabled: { opacity: 0.45 },
  valuesInput: { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: 8, borderWidth: 1, color: colors.textPrimary, fontSize: 11, marginTop: 10, padding: 9 },
  refresh: { alignSelf: 'flex-start', marginTop: 12 },
  refreshText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
});
