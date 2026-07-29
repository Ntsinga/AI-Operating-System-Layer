import { StyleSheet, View } from 'react-native';

type IconProps = {
  color: string;
  size?: number;
};

// Monochrome icons drawn from Views (no emoji, no icon font) so they inherit a single
// theme color and never clash with the dark blue/purple palette. `color` is white on the
// active gradient tab and muted on inactive tabs.

// Chat: a filled rounded speech bubble with a small tail.
export function ChatIcon({ color, size = 18 }: IconProps) {
  const bubbleHeight = size * 0.78;
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          width: size,
          height: bubbleHeight,
          borderRadius: size * 0.28,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: size * 0.2,
          width: 0,
          height: 0,
          borderLeftWidth: size * 0.16,
          borderTopWidth: size * 0.2,
          borderLeftColor: 'transparent',
          borderTopColor: color,
        }}
      />
    </View>
  );
}

// Settings: a 2x2 grid of rounded squares (mirrors the "Apps" grid icon in the brand image).
export function SettingsIcon({ color, size = 18 }: IconProps) {
  const cell = size * 0.42;
  const radius = cell * 0.32;
  return (
    <View style={[styles.grid, { width: size, height: size }]}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={{ width: cell, height: cell, borderRadius: radius, backgroundColor: color }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignContent: 'space-between',
  },
});
