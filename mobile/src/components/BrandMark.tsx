import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { brandGradient, colors, gradientEnd, gradientStart } from '../theme';

type Props = {
  size?: number;
};

// The AI-OS "face": a gradient ring with two vertical gradient eyes, matching the
// brand logo. Built from Views (gradient ring = gradient circle with a background-
// colored inner circle punched out) so it needs no image asset.
export function BrandMark({ size = 44 }: Props) {
  const ring = size;
  const inner = size * 0.82;
  const eyeWidth = size * 0.11;
  const eyeHeight = size * 0.28;
  const eyeGap = size * 0.14;

  return (
    <LinearGradient
      colors={brandGradient}
      start={gradientStart}
      end={gradientEnd}
      style={[styles.ring, { width: ring, height: ring, borderRadius: ring / 2 }]}
    >
      <View
        style={[
          styles.inner,
          { width: inner, height: inner, borderRadius: inner / 2, gap: eyeGap },
        ]}
      >
        {[0, 1].map((eye) => (
          <LinearGradient
            key={eye}
            colors={brandGradient}
            start={gradientStart}
            end={gradientEnd}
            style={{ width: eyeWidth, height: eyeHeight, borderRadius: eyeWidth / 2 }}
          />
        ))}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flexDirection: 'row',
    justifyContent: 'center',
  },
});
