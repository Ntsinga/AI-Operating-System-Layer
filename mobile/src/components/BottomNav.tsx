import { LinearGradient } from 'expo-linear-gradient';
import { type ComponentType } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { brandGradient, colors, gradientEnd, gradientStart } from '../theme';
import { ChatIcon, ToolsIcon } from './TabIcons';

export type TabKey = 'chat' | 'tools';

type Props = {
  active: TabKey;
  onChange: (tab: TabKey) => void;
};

const TABS: { key: TabKey; label: string; Icon: ComponentType<{ color: string; size?: number }> }[] = [
  { key: 'chat', label: 'Chat', Icon: ChatIcon },
  { key: 'tools', label: 'Tools', Icon: ToolsIcon },
];

// Two-tab bottom navigation: Chat (the AI assistant) and Tools (individual capabilities).
// The active tab gets a gradient pill so it reads against the dark bar.
export function BottomNav({ active, onChange }: Props) {
  const insets = useSafeAreaInsets();

  return (
    // Android's edge-to-edge mode (gradle.properties: edgeToEdgeEnabled=true) draws this app
    // behind the system navigation bar; without adding its height here, the nav pills render
    // underneath the phone's own back/home/recents buttons instead of above them.
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        const iconColor = isActive ? colors.onAccent : colors.textMuted;
        const content = (
          <>
            <tab.Icon color={iconColor} />
            <Text style={[styles.label, isActive ? styles.labelActive : styles.labelInactive]}>{tab.label}</Text>
          </>
        );

        return (
          <Pressable
            key={tab.key}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            onPress={() => onChange(tab.key)}
            style={styles.tab}
          >
            {isActive ? (
              <LinearGradient
                colors={brandGradient}
                start={gradientStart}
                end={gradientEnd}
                style={styles.activePill}
              >
                {content}
              </LinearGradient>
            ) : (
              <View style={styles.inactivePill}>{content}</View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  tab: {
    flex: 1,
  },
  activePill: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: 12,
  },
  inactivePill: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: 12,
  },
  label: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  labelActive: {
    color: colors.onAccent,
  },
  labelInactive: {
    color: colors.textMuted,
  },
});
