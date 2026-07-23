import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AdjustVolumeResult, VolumeDirection } from '../native/Audio';
import { colors } from '../theme';
import { adjustVolumeTool } from '../tools/registry';

const DIRECTIONS: { direction: VolumeDirection; label: string }[] = [
  { direction: 'down', label: 'Volume -' },
  { direction: 'up', label: 'Volume +' },
  { direction: 'mute', label: 'Mute' },
  { direction: 'unmute', label: 'Unmute' },
];

export function AudioControlCard() {
  const [state, setState] = useState<AdjustVolumeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<VolumeDirection | null>(null);

  async function run(direction: VolumeDirection) {
    if (pending) {
      return;
    }

    setPending(direction);
    setError(null);

    try {
      const result = await adjustVolumeTool.execute({ direction });
      setState(result);
    } catch (adjustError) {
      setError(adjustError instanceof Error ? adjustError.message : 'Failed to adjust volume.');
    } finally {
      setPending(null);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.info}>
        <Text style={styles.name}>{adjustVolumeTool.name}</Text>
        <Text style={styles.description}>{adjustVolumeTool.description}</Text>
      </View>

      <View style={styles.buttonRow}>
        {DIRECTIONS.map(({ direction, label }) => (
          <Pressable
            key={direction}
            accessibilityRole="button"
            disabled={pending !== null}
            onPress={() => run(direction)}
            style={({ pressed }) => [
              styles.button,
              pending !== null && styles.buttonDisabled,
              pressed && pending === null && styles.buttonPressed,
            ]}
          >
            <Text style={styles.buttonText}>{pending === direction ? '...' : label}</Text>
          </Pressable>
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {state ? (
        <Text style={styles.status}>
          {state.currentVolume} / {state.maxVolume}
          {state.isMuted ? ' (muted)' : ''}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
    padding: 16,
  },
  info: {
    marginBottom: 14,
  },
  name: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0,
  },
  description: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  button: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    borderRadius: 10,
    flexBasis: '47%',
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPressed: {
    backgroundColor: colors.border,
    transform: [{ scale: 0.98 }],
  },
  buttonText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0,
  },
  error: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.dangerText,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 12,
    padding: 10,
  },
  status: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 12,
  },
});
