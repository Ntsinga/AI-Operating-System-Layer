import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { brandGradient, colors, gradientEnd, gradientStart } from '../theme';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

// Primary action button with the brand blue -> purple gradient fill. When disabled
// it drops the gradient for a flat muted surface so it reads as inactive.
export function GradientButton({ label, onPress, disabled = false, style }: Props) {
  if (disabled) {
    return (
      <View style={[styles.button, styles.disabled, style]}>
        <Text style={[styles.label, styles.labelDisabled]}>{label}</Text>
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [style, pressed && styles.pressed]}
    >
      <LinearGradient colors={brandGradient} start={gradientStart} end={gradientEnd} style={styles.button}>
        <Text style={styles.label}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
  },
  disabled: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderWidth: 1,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  label: {
    color: colors.onAccent,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  labelDisabled: {
    color: colors.textMuted,
  },
});
