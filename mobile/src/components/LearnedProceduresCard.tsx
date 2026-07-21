import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { deleteLearnedProcedure, listLearnedProcedures } from '../planner/learningClient';
import { colors } from '../theme';

type Procedure = { id: number; intent: string; outcome: string; scope: string; version: number; createdAt: string };

export function LearnedProceduresCard() {
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try { setProcedures(await listLearnedProcedures()); setError(null); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Could not load learned procedures.'); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function remove(id: number) {
    try { await deleteLearnedProcedure(id); await refresh(); }
    catch (deleteError) { setError(deleteError instanceof Error ? deleteError.message : 'Could not delete procedure.'); }
  }

  return <View style={styles.card}>
    <Text style={styles.title}>Learned procedures</Text>
    <Text style={styles.description}>Review or delete what AI-OS has learned. No screenshots or tool results are stored.</Text>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {procedures.length === 0 ? <Text style={styles.empty}>No procedures saved yet.</Text> : procedures.slice(0, 10).map((procedure) => (
      <View key={procedure.id} style={styles.row}>
        <View style={styles.copy}><Text style={styles.intent} numberOfLines={2}>{procedure.intent}</Text><Text style={styles.meta}>v{procedure.version} · {procedure.outcome} · {procedure.scope}</Text></View>
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
  refresh: { alignSelf: 'flex-start', marginTop: 12 }, refreshText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
});
