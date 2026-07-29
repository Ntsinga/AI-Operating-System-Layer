import { useCallback, useEffect, useState } from 'react';
import { Alert, DeviceEventEmitter, Pressable, StyleSheet, Text, View } from 'react-native';
import { approveLearnedProcedure, deleteLearnedProcedure, listLearnedProcedures, recordDebugEvents } from '../planner/learningClient';
import { replayLearningActions } from '../native/LearningWatcher';
import { BACKEND_BASE_URL } from '../config/backend';
import { colors } from '../theme';

type Procedure = { id: number; intent: string; steps: Array<{ arguments?: Record<string, unknown> }>; outcome: string; scope: string; version: number; state: string; createdAt: string };
type BusyState = { id: number; action: 'approve' | 'delete' | 'replay' | 'refresh' };
const PAGE_SIZE = 10;

function hasStableReplaySelector(args: Record<string, unknown>) {
  const resourceId = String(args.resourceId ?? '');
  const contentDescription = String(args.contentDescription ?? '');
  const text = String(args.text ?? '');
  const fieldKey = String(args.fieldKey ?? '');
  return Boolean(resourceId || contentDescription || (fieldKey && fieldKey !== text));
}

function hasRealReplayAction(procedure: Procedure) {
  return procedure.steps.some((step) => {
    const action = String(step.arguments?.action ?? '');
    return (action === 'tap' || action === 'text_input') && hasStableReplaySelector(step.arguments ?? {});
  });
}

function replaySelectorDiagnostics(procedure: Procedure) {
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

export function LearnedProceduresCard() {
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyState | null>(null);
  const [page, setPage] = useState(0);

  const refresh = useCallback(async () => {
    try { setProcedures(await listLearnedProcedures()); setError(null); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Could not load learned procedures.'); }
  }, []);

  useEffect(() => {
    void refresh();
    const subscription = DeviceEventEmitter.addListener('aios.learning.procedureSaved', () => {
      void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  // Clamp the current page after a delete (or a shorter refreshed list) leaves it past the end.
  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(procedures.length / PAGE_SIZE) - 1);
    if (page > maxPage) setPage(maxPage);
  }, [procedures.length, page]);

  async function remove(id: number, intent: string) {
    if (busy) return;
    Alert.alert('Delete this procedure?', `"${intent}" will be permanently deleted and can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusy({ id, action: 'delete' }); setStatus(null);
            try { await deleteLearnedProcedure(id); await refresh(); }
            catch (deleteError) { setError(deleteError instanceof Error ? deleteError.message : 'Could not delete procedure.'); }
            finally { setBusy(null); }
          })();
        },
      },
    ]);
  }
  async function approve(id: number) {
    if (busy) return;
    setBusy({ id, action: 'approve' }); setStatus(null);
    try { await approveLearnedProcedure(id); await refresh(); }
    catch (approveError) { setError(approveError instanceof Error ? approveError.message : 'Could not approve procedure.'); }
    finally { setBusy(null); }
  }
  async function replay(procedure: Procedure) {
    if (busy) return;
    setBusy({ id: procedure.id, action: 'replay' });
    setError(null); setStatus(null);
    const selectedProcedure = procedure;
    const traceId = `replay-${procedure.id}-${Date.now()}`;
    try {
      // No runtime-value overrides from this card - replay just uses whatever was originally
      // taught for each step.
      const values: Record<string, string> = {};
      if (!hasRealReplayAction(selectedProcedure)) {
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
        throw new Error(`Learned procedure ${selectedProcedure.id} cannot replay yet: it has no stable tap or text-input selector.`);
      }
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
      const result = await replayLearningActions(procedure.steps.map((step) => step.arguments ?? {}), values, undefined, targetSurface, BACKEND_BASE_URL, procedure.id);
      await recordDebugEvents((result.trace ?? []).map((event) => ({
        traceId,
        flow: 'replay',
        event: String(event.event ?? 'native_replay_event'),
        level: String(event.level ?? 'info'),
        procedureId: procedure.id,
        step: typeof event.step === 'number' ? event.step : undefined,
        details: typeof event.details === 'object' && event.details !== null ? event.details as Record<string, unknown> : {},
      }))).catch(() => undefined);
      setStatus(`Replay complete: ${result.executed} action(s) executed, ${result.skipped} skipped.`);
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
    } finally {
      setBusy(null);
    }
  }

  async function refreshWithStatus() {
    if (busy) return;
    setBusy({ id: -1, action: 'refresh' }); setStatus(null);
    try { await refresh(); }
    finally { setBusy(null); }
  }

  const totalPages = Math.max(1, Math.ceil(procedures.length / PAGE_SIZE));
  const shown = procedures.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return <View style={styles.card}>
    <Text style={styles.title}>Learned procedures</Text>
    <Text style={styles.description}>Review, replay, or delete what AI-OS has learned. No screenshots or tool results are stored.</Text>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {status ? <Text style={styles.status}>{status}</Text> : null}
    {procedures.length === 0 ? <Text style={styles.empty}>No procedures saved yet.</Text> : shown.map((procedure) => {
      return (
        <View key={procedure.id} style={styles.row}>
          <View style={styles.copy}><Text style={styles.intent} numberOfLines={2}>{procedure.intent}</Text><Text style={styles.meta}>v{procedure.version} · {procedure.state} · {procedure.outcome} · {procedure.scope}</Text></View>
          {procedure.state === 'draft' ? (
            <Text style={styles.draftHint}>New procedures start as drafts - approve before they can be replayed.</Text>
          ) : null}
          <View style={styles.actionsRow}>
            {procedure.state === 'draft' ? <Pressable disabled={Boolean(busy)} onPress={() => void approve(procedure.id)} style={[styles.approve, busy ? styles.disabled : null]}><Text style={styles.approveText}>{busy?.id === procedure.id && busy.action === 'approve' ? 'Approving...' : 'Approve'}</Text></Pressable> : <Pressable disabled={Boolean(busy)} onPress={() => void replay(procedure)} style={[styles.replay, busy ? styles.disabled : null]}><Text style={styles.replayText}>{busy?.id === procedure.id && busy.action === 'replay' ? 'Replaying...' : 'Replay'}</Text></Pressable>}
            <Pressable disabled={Boolean(busy)} onPress={() => void remove(procedure.id, procedure.intent)} style={[styles.delete, busy ? styles.disabled : null]}><Text style={styles.deleteText}>{busy?.id === procedure.id && busy.action === 'delete' ? 'Deleting...' : 'Delete'}</Text></Pressable>
          </View>
        </View>
      );
    })}
    {totalPages > 1 ? (
      <View style={styles.pagerRow}>
        <Pressable disabled={page === 0} onPress={() => setPage((current) => Math.max(0, current - 1))} style={[styles.pagerButton, page === 0 && styles.disabled]}><Text style={styles.pagerButtonText}>‹ Prev</Text></Pressable>
        <Text style={styles.pagerLabel}>Page {page + 1} of {totalPages}</Text>
        <Pressable disabled={page >= totalPages - 1} onPress={() => setPage((current) => Math.min(totalPages - 1, current + 1))} style={[styles.pagerButton, page >= totalPages - 1 && styles.disabled]}><Text style={styles.pagerButtonText}>Next ›</Text></Pressable>
      </View>
    ) : null}
    <Pressable disabled={Boolean(busy)} onPress={() => void refreshWithStatus()} style={[styles.refresh, busy ? styles.disabled : null]}><Text style={styles.refreshText}>{busy?.action === 'refresh' ? 'Refreshing...' : 'Refresh'}</Text></Pressable>
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, marginBottom: 14, padding: 14 },
  title: { color: colors.textPrimary, fontSize: 17, fontWeight: '800' },
  description: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 5 },
  empty: { color: colors.textMuted, fontSize: 13, marginTop: 12 },
  error: { color: colors.dangerText, fontSize: 12, marginTop: 8 },
  status: { color: colors.positive, fontSize: 12, fontWeight: '700', marginTop: 8 },
  pagerRow: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between', marginTop: 12 },
  pagerButton: { borderColor: colors.border, borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7 },
  pagerButtonText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  pagerLabel: { color: colors.textMuted, fontSize: 12 },
  row: { borderTopColor: colors.border, borderTopWidth: 1, marginTop: 10, paddingTop: 10 },
  copy: { flex: 1 }, intent: { color: colors.textPrimary, fontSize: 13 }, meta: { color: colors.textMuted, fontSize: 11, marginTop: 3 },
  draftHint: { color: colors.textMuted, fontSize: 11, fontStyle: 'italic', marginTop: 6 },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  delete: { borderColor: colors.dangerBorder, borderRadius: 8, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 7 }, deleteText: { color: colors.dangerText, fontSize: 12 },
  approve: { borderColor: colors.positiveBorder, borderRadius: 8, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 7 }, approveText: { color: colors.positive, fontSize: 12 },
  replay: { borderColor: colors.borderStrong, borderRadius: 8, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 7 }, replayText: { color: colors.accent, fontSize: 12 },
  refresh: { alignSelf: 'flex-start', marginTop: 12 }, refreshText: { color: colors.accent, fontSize: 12, fontWeight: '700' }, disabled: { opacity: 0.45 },
});
