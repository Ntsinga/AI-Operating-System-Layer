import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { colors, touchTarget } from '../theme';
import { WorkflowCard } from './WorkflowCard';

type Props = {
  open: boolean;
  onClose: () => void;
  command: string | null;
  onCommandConsumed: () => void;
  liveVoiceRequested: boolean;
  onLiveVoiceConsumed: () => void;
  leftHanded: boolean;
  focusToken: number;
};

const SHEET_HEIGHT_RATIO = 0.9;

// The chat, folded into the Home ask bar: a sheet that rises from the bottom over a scrim. It is
// drawn in the app's own window (not a Modal) so the keyboard behaves like the rest of the app,
// and it stays mounted after the first open so an in-flight task isn't lost when it is closed.
export function ChatSheet({
  open,
  onClose,
  command,
  onCommandConsumed,
  liveVoiceRequested,
  onLiveVoiceConsumed,
  leftHanded,
  focusToken,
}: Props) {
  const { height } = useWindowDimensions();
  const sheetHeight = Math.round(height * SHEET_HEIGHT_RATIO);
  const progress = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    if (!open) Keyboard.dismiss();
  }, [open, progress]);

  if (!mounted) return null;

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [sheetHeight, 0] });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? 'box-none' : 'none'}>
      <Animated.View style={[styles.scrim, { opacity: progress }]} pointerEvents={open ? 'auto' : 'none'}>
        <Pressable accessibilityLabel="Close chat" onPress={onClose} style={StyleSheet.absoluteFill} />
      </Animated.View>

      <Animated.View
        style={[styles.sheet, { height: sheetHeight, transform: [{ translateY }] }]}
        pointerEvents={open ? 'auto' : 'none'}
      >
        <Pressable accessibilityRole="button" accessibilityLabel="Close chat" onPress={onClose} style={styles.handleArea}>
          <View style={styles.handle} />
        </Pressable>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Ask AI-OS</Text>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>

        <KeyboardAvoidingView style={styles.body} behavior="padding">
          <WorkflowCard
            initialCommand={command}
            onInitialCommandConsumed={onCommandConsumed}
            liveVoiceRequested={liveVoiceRequested}
            onLiveVoiceRequestConsumed={onLiveVoiceConsumed}
            leftHanded={leftHanded}
            focusToken={focusToken}
          />
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(3, 5, 10, 0.6)',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  handleArea: {
    alignItems: 'center',
    height: 24,
    justifyContent: 'center',
  },
  handle: {
    backgroundColor: colors.borderStrong,
    borderRadius: 2,
    height: 4,
    width: 40,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  closeButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: touchTarget,
    minWidth: touchTarget,
  },
  closeText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '700',
  },
  body: {
    flex: 1,
  },
});
