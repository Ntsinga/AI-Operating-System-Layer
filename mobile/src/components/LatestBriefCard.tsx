import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getBriefStore } from '../native/BriefStore';
import { colors } from '../theme';

export function LatestBriefCard() {
  const [brief, setBrief] = useState<string | null>(null);
  useEffect(() => { void getBriefStore().getBrief().then(setBrief).catch(() => undefined); }, []);
  if (!brief) return null;
  return <View style={styles.card}><Text style={styles.title}>Latest meeting brief</Text><Text style={styles.text} selectable>{brief}</Text></View>;
}
const styles = StyleSheet.create({ card: { backgroundColor: colors.infoBg, borderColor: colors.infoBorder, borderRadius: 14, borderWidth: 1, marginBottom: 16, padding: 16 }, title: { color: colors.textPrimary, fontSize: 16, fontWeight: '800', marginBottom: 8 }, text: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 } });
