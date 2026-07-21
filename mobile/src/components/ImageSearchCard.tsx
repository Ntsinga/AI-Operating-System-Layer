import { useState } from 'react';
import { Alert, FlatList, Image, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { searchImages, type ImageSearchResult } from '../planner/searchImagesClient';
import { setWallpaperTool } from '../tools/registry';
import type { WallpaperTarget } from '../native/Wallpaper';
import { colors } from '../theme';
import { GradientButton } from './GradientButton';

export function ImageSearchCard() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ImageSearchResult[]>([]);
  const [selected, setSelected] = useState<ImageSearchResult | null>(null);
  const [target, setTarget] = useState<WallpaperTarget>('home');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSearch() {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    setSelected(null);
    try {
      setResults(await searchImages(query.trim()));
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : 'Image search failed.');
    } finally {
      setBusy(false);
    }
  }

  function applyWallpaper() {
    if (!selected) return;
    Alert.alert('Set wallpaper?', `Apply this image to the ${target} wallpaper?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Set wallpaper',
        onPress: async () => {
          setBusy(true);
          setError(null);
          try {
            await setWallpaperTool.execute({ imageUri: selected.imageUrl, target });
          } catch (wallpaperError) {
            setError(wallpaperError instanceof Error ? wallpaperError.message : 'Failed to set wallpaper.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.card}>
      <Text style={styles.name}>Image search</Text>
      <Text style={styles.description}>
        Search structured image results, choose one, then send it to the wallpaper tool.
      </Text>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="e.g. Cristiano Ronaldo portrait"
          placeholderTextColor={colors.textMuted}
          editable={!busy}
          onSubmitEditing={runSearch}
        />
        <GradientButton label={busy ? '...' : 'Search'} disabled={busy || !query.trim()} onPress={runSearch} />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={results}
        numColumns={2}
        scrollEnabled={false}
        keyExtractor={(item, index) => `${item.imageUrl}-${index}`}
        columnWrapperStyle={styles.row}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.result, selected?.imageUrl === item.imageUrl && styles.selectedResult]}
            onPress={() => setSelected(item)}
          >
            <Image source={{ uri: item.thumbnailUrl }} style={styles.thumbnail} />
            <Text style={styles.resultTitle} numberOfLines={2}>{item.title || 'Image result'}</Text>
          </Pressable>
        )}
      />

      {selected ? (
        <View style={styles.selectedBox}>
          <Text style={styles.selectedLabel}>Selected image</Text>
          <View style={styles.targetRow}>
            {(['home', 'lock', 'both'] as WallpaperTarget[]).map((option) => (
              <Pressable key={option} onPress={() => setTarget(option)} style={[styles.target, target === option && styles.targetActive]}>
                <Text style={[styles.targetText, target === option && styles.targetTextActive]}>{option}</Text>
              </Pressable>
            ))}
          </View>
          <GradientButton label="Set as wallpaper" disabled={busy} onPress={applyWallpaper} />
          {selected.sourceUrl ? (
            <Text style={styles.source} onPress={() => Linking.openURL(selected.sourceUrl)}>
              Open source page
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, marginBottom: 16, padding: 16 },
  name: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  description: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 6 },
  searchRow: { gap: 8, marginTop: 12 },
  input: { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: 10, borderWidth: 1, color: colors.textPrimary, minHeight: 46, paddingHorizontal: 12 },
  error: { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder, borderRadius: 10, borderWidth: 1, color: colors.dangerText, marginTop: 12, padding: 10 },
  row: { gap: 8, marginTop: 10 },
  result: { backgroundColor: colors.surfaceAlt, borderColor: colors.border, borderRadius: 10, borderWidth: 1, flex: 1, overflow: 'hidden' },
  selectedResult: { borderColor: colors.accent, borderWidth: 2 },
  thumbnail: { backgroundColor: colors.codeBg, height: 130, width: '100%' },
  resultTitle: { color: colors.textSecondary, fontSize: 11, lineHeight: 15, padding: 7 },
  selectedBox: { borderColor: colors.border, borderTopWidth: 1, marginTop: 14, paddingTop: 14 },
  selectedLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '800', marginBottom: 8, textTransform: 'uppercase' },
  targetRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  target: { borderColor: colors.border, borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  targetActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  targetText: { color: colors.textSecondary, fontSize: 12 },
  targetTextActive: { color: '#FFFFFF', fontWeight: '800' },
  source: { color: colors.accent, fontSize: 12, marginTop: 10, textDecorationLine: 'underline' },
});
