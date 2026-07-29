import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { openUrlExternalTool, openUrlInAiosBrowserTool } from '../tools/registry';
import { colors } from '../theme';
import { GradientButton } from './GradientButton';

type Destination = 'external' | 'aios';

// Merges what used to be two near-identical cards (open_url_external / open_url_in_aios_browser)
// into one field with a destination toggle, since a manual user picking between two separate
// "paste a URL" cards had no obvious way to know which one to use.
export function OpenUrlCard() {
  const [url, setUrl] = useState('');
  const [destination, setDestination] = useState<Destination>('external');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    if (!url.trim()) return;
    setBusy(true); setError(null);
    try {
      if (destination === 'external') await openUrlExternalTool.execute({ url: url.trim() });
      else await openUrlInAiosBrowserTool.execute({ url: url.trim() });
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not open that URL.'); }
    finally { setBusy(false); }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Open URL</Text>
      <Text style={styles.description}>Open a link externally (Chrome), or inside AI-OS's own browser where navigation can be observed.</Text>
      <TextInput style={styles.input} value={url} onChangeText={setUrl} placeholder="https://..." placeholderTextColor={colors.textMuted} autoCapitalize="none" editable={!busy} />
      <View style={styles.toggleRow}>
        {(['external', 'aios'] as Destination[]).map((option) => (
          <Pressable key={option} onPress={() => setDestination(option)} style={[styles.toggle, destination === option && styles.toggleActive]}>
            <Text style={[styles.toggleText, destination === option && styles.toggleTextActive]}>{option === 'external' ? 'External browser' : 'AI-OS browser'}</Text>
          </Pressable>
        ))}
      </View>
      <GradientButton label={busy ? 'Opening...' : 'Open'} disabled={busy || !url.trim()} onPress={() => void open()} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, marginBottom: 16, padding: 16 },
  title: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  description: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 12, marginTop: 6 },
  input: { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: 10, borderWidth: 1, color: colors.textPrimary, marginBottom: 10, minHeight: 46, paddingHorizontal: 12 },
  toggleRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  toggle: { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: 8, borderWidth: 1, flex: 1, paddingVertical: 8 },
  toggleActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  toggleText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  toggleTextActive: { color: colors.onAccent },
  error: { color: colors.dangerText, marginTop: 10 },
});
