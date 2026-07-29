import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { searchWeb, type WebSearchResult } from '../planner/searchWebClient';
import { colors } from '../theme';
import { GradientButton } from './GradientButton';

// Merges what used to be two separate cards (search_web's structured results, open_web_search's
// "just open a browser tab") into one flow: search inline, tap a result to open it.
export function WebSearchCard() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WebSearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSearch() {
    if (!query.trim()) return;
    setBusy(true); setError(null);
    try { setResults(await searchWeb(query.trim())); }
    catch (e) { setError(e instanceof Error ? e.message : 'Web search failed.'); }
    finally { setBusy(false); }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Web search</Text>
      <Text style={styles.description}>Search the web and tap a result to open it.</Text>
      <View style={styles.searchRow}>
        <TextInput style={styles.input} value={query} onChangeText={setQuery} placeholder="Search query" placeholderTextColor={colors.textMuted} editable={!busy} onSubmitEditing={runSearch} />
        <GradientButton label={busy ? '...' : 'Search'} disabled={busy || !query.trim()} onPress={() => void runSearch()} />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {results.map((result, index) => (
        <Pressable key={`${result.url}-${index}`} style={styles.result} onPress={() => Linking.openURL(result.url)}>
          <Text style={styles.resultTitle} numberOfLines={1}>{result.title || result.url}</Text>
          <Text style={styles.resultDescription} numberOfLines={2}>{result.description}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, marginBottom: 16, padding: 16 },
  title: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  description: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 12, marginTop: 6 },
  searchRow: { gap: 8 },
  input: { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: 10, borderWidth: 1, color: colors.textPrimary, minHeight: 46, paddingHorizontal: 12 },
  error: { color: colors.dangerText, marginTop: 10 },
  result: { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: 10, borderWidth: 1, marginTop: 10, padding: 10 },
  resultTitle: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  resultDescription: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
});
