import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { getStorageCleanupModule, type StorageCandidate } from '../native/StorageCleanup';
import { colors } from '../theme';
import { GradientButton } from './GradientButton';

export function StorageCleanupCard() {
  const [candidates, setCandidates] = useState<StorageCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function scan() {
    setBusy(true); setError(null); setSelected(new Set());
    try { setCandidates(await getStorageCleanupModule().findStorageCandidates(20)); }
    catch (scanError) { setError(scanError instanceof Error ? scanError.message : 'Storage scan failed.'); }
    finally { setBusy(false); }
  }

  function toggle(uri: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(uri)) next.delete(uri); else next.add(uri);
      return next;
    });
  }

  function deleteSelected() {
    if (!selected.size) return;
    Alert.alert('Delete selected media?', `${selected.size} item(s) will be sent to Android’s delete confirmation.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Continue', style: 'destructive', onPress: async () => {
        setBusy(true); setError(null);
        try { await getStorageCleanupModule().deleteStorageCandidates([...selected]); await scan(); }
        catch (deleteError) { setError(deleteError instanceof Error ? deleteError.message : 'Delete failed.'); }
        finally { setBusy(false); }
      } },
    ]);
  }

  return <View style={styles.card}>
    <Text style={styles.name}>Safe storage cleanup</Text>
    <Text style={styles.description}>Scans shared media, ranks large/old files, and requires two confirmations before deletion.</Text>
    <GradientButton label={busy ? 'Scanning...' : 'Scan storage'} disabled={busy} onPress={scan} />
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {candidates.map((item) => <Pressable key={item.uri} onPress={() => toggle(item.uri)} style={[styles.row, selected.has(item.uri) && styles.selected]}>
      <View style={styles.checkbox}><Text style={styles.check}>{selected.has(item.uri) ? '✓' : ''}</Text></View>
      <View style={styles.rowText}><Text style={styles.fileName} numberOfLines={1}>{item.name}</Text><Text style={styles.meta}>{item.sizeMb.toFixed(1)} MB · {item.ageDays} days old · {item.reason}</Text></View>
    </Pressable>)}
    {selected.size ? <GradientButton label={busy ? 'Deleting...' : `Delete ${selected.size} selected`} disabled={busy} onPress={deleteSelected} /> : null}
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, marginBottom: 16, padding: 16 },
  name: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  description: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 12, marginTop: 6 },
  error: { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder, borderRadius: 10, borderWidth: 1, color: colors.dangerText, marginTop: 12, padding: 10 },
  row: { alignItems: 'center', borderColor: colors.border, borderTopWidth: 1, flexDirection: 'row', gap: 10, paddingVertical: 10 },
  selected: { backgroundColor: colors.positiveBg },
  checkbox: { alignItems: 'center', borderColor: colors.border, borderRadius: 5, borderWidth: 1, height: 22, justifyContent: 'center', width: 22 },
  check: { color: colors.positive, fontWeight: '900' },
  rowText: { flex: 1 },
  fileName: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  meta: { color: colors.textMuted, fontSize: 11, marginTop: 3 },
});
