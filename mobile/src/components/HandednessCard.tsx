import { StyleSheet, Switch, Text, View } from 'react-native';

import { colors, touchTarget } from '../theme';

type Props = {
  leftHanded: boolean;
  onChange: (leftHanded: boolean) => void;
};

// Mirrors the thumb-operated controls (the mic and send buttons) to the left so a left-handed
// user's thumb reaches them. Default is the right-handed layout; see ../../DESIGN.md.
export function HandednessCard({ leftHanded, onChange }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.text}>
        <Text style={styles.title}>Left-handed layout</Text>
        <Text style={styles.description}>Moves the mic and send buttons to the left side.</Text>
      </View>
      <Switch
        accessibilityLabel="Left-handed layout"
        value={leftHanded}
        onValueChange={onChange}
        trackColor={{ false: colors.borderStrong, true: colors.accent }}
        thumbColor={colors.textPrimary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    minHeight: touchTarget + 16,
    padding: 16,
  },
  text: {
    flex: 1,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 4,
  },
  description: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
});
