import { useEffect, useRef, useState } from 'react';
import { NativeModules, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  isLiveVoiceSessionActive,
  startLiveVoiceSession,
  stopLiveVoiceSession,
  subscribeLiveVoice,
  type CaptionEvent,
  type ProposedToolEvent,
} from '../native/LiveVoice';
import { getInstalledAppsTool } from '../tools/registry';
import { buildOpenAiToolSchemas } from '../tools/openAiSchema';
import { colors } from '../theme';

type Props = {
  // Handed the exact {threadId, proposedTool} shape WorkflowCard's applyResponse already
  // knows how to turn into a confirm card (or an auto-executed step) - see WorkflowCard.tsx.
  onProposedTool: (event: ProposedToolEvent) => void;
  onError?: (message: string) => void;
  // Set when the "Hey Casper" wake word launched this session (App.tsx's aios://voice?live=1
  // deep link) - auto-starts instead of waiting for a tap, mirroring initialCommand's
  // auto-start pattern for typed/wake-word text commands.
  autoStart?: boolean;
  onAutoStartConsumed?: () => void;
  // Compact mode (the docked chat composer): the button keeps a fixed 46dp footprint and its status
  // and captions float in a bubble above it instead of growing the row underneath it.
  compact?: boolean;
  bubbleAlign?: 'left' | 'right';
};

const MAX_VISIBLE_CAPTIONS = 4;

// Full-duplex "talk to Casper" button: tap to start a live GPT-Live-1 session (backend/app/
// live_voice.py), see live captions of both sides of the conversation, and stop it. Tool
// proposals are handed up to the caller instead of executed here - see the Props comment.
export function LiveVoiceButton({
  onProposedTool,
  onError,
  autoStart,
  onAutoStartConsumed,
  compact = false,
  bubbleAlign = 'right',
}: Props) {
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [captions, setCaptions] = useState<CaptionEvent[]>([]);
  const autoStartedRef = useRef(false);

  useEffect(() => {
    return subscribeLiveVoice({
      onProposedTool,
      onCaption: (event) => setCaptions((prev) => [...prev.slice(-(MAX_VISIBLE_CAPTIONS - 1)), event]),
      onSessionEnded: () => {
        setActive(false);
        setStarting(false);
        notifyWakeWordServiceLiveSessionEnded();
      },
      onError: (event) => {
        setActive(false);
        setStarting(false);
        onError?.(event.message);
      },
    });
    // onProposedTool/onError are expected to be stable callbacks from the parent -
    // resubscribing on every parent render would drop events mid-flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    if (active || starting) return;
    setStarting(true);
    setCaptions([]);
    try {
      const installedApps = await getInstalledAppsTool.execute().catch(() => undefined);
      await startLiveVoiceSession(buildOpenAiToolSchemas(), installedApps);
      setActive(true);
    } catch (startError) {
      // The connection never even opened (bad URL, no network, backend down, GPT-Live-1
      // not enabled on the account yet, etc.) - no onSessionEnded/onError native event will
      // ever fire for this attempt, so this is the only place that can tell a wake-word-
      // triggered session to hand listening back to the KWS loop. Without this, one failed
      // connection attempt after "Hey Casper" would leave wake-word detection dead until the
      // voice-activation service is restarted.
      notifyWakeWordServiceLiveSessionEnded();
      onError?.(startError instanceof Error ? startError.message : 'Failed to start live voice session.');
    } finally {
      setStarting(false);
    }
  }

  async function stop() {
    if (!active) return;
    try {
      await stopLiveVoiceSession();
    } catch {
      // Native side may have already torn the session down (e.g. it just errored) -
      // onSessionEnded/onError already reset local state either way.
    }
    setActive(false);
    notifyWakeWordServiceLiveSessionEnded();
  }

  useEffect(() => {
    if (autoStart && !autoStartedRef.current) {
      autoStartedRef.current = true;
      onAutoStartConsumed?.();
      void start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  useEffect(() => {
    // Reconcile with native state on mount in case a wake-word-triggered session was
    // already running before this component (re)mounted - e.g. the app was foregrounded
    // by the deep link a moment before React finished rendering this tab.
    isLiveVoiceSessionActive().then(setActive).catch(() => undefined);
  }, []);

  const icon = active ? '⏹' : starting ? '…' : '🎙';
  const statusText = active ? '● Live - tap to end' : starting ? 'Connecting...' : null;
  const details = (
    <>
      {statusText ? <Text style={[styles.statusText, compact && styles.statusTextCompact]}>{statusText}</Text> : null}
      {captions.length > 0 ? (
        <View style={styles.captionsBox}>
          {captions.map((caption, index) => (
            <Text
              key={index}
              style={[styles.captionText, caption.speaker === 'user' ? styles.captionUser : styles.captionAssistant]}
              numberOfLines={2}
            >
              {caption.speaker === 'user' ? 'You: ' : 'Casper: '}
              {caption.text}
            </Text>
          ))}
        </View>
      ) : null}
    </>
  );

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={active ? 'End live conversation' : 'Start live conversation'}
        disabled={starting}
        onPress={() => void (active ? stop() : start())}
        style={({ pressed }) => [
          styles.button,
          active && styles.buttonActive,
          starting && styles.buttonDisabled,
          pressed && !starting && styles.buttonPressed,
        ]}
      >
        <Text style={styles.icon}>{icon}</Text>
      </Pressable>
      {compact ? (
        statusText || captions.length > 0 ? (
          <View style={[styles.compactBubble, bubbleAlign === 'left' ? styles.bubbleLeft : styles.bubbleRight]}>
            {details}
          </View>
        ) : null
      ) : (
        details
      )}
    </View>
  );
}

// Only relevant if "Hey Casper" launched this session (VoiceActivationService.kt stops its
// keyword spotter before opening one, so it doesn't compete with this session's own mic
// use) - a no-op if the wake-word service isn't running or wasn't the one that started it.
function notifyWakeWordServiceLiveSessionEnded() {
  const { AiosVoiceActivation } = NativeModules as { AiosVoiceActivation?: { notifyLiveSessionEnded?: () => void } };
  AiosVoiceActivation?.notifyLiveSessionEnded?.();
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  button: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 10,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  buttonActive: {
    backgroundColor: colors.danger,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonPressed: {
    transform: [{ scale: 0.96 }],
  },
  icon: {
    fontSize: 18,
  },
  statusText: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
    textAlign: 'center',
    width: 110,
  },
  captionsBox: {
    marginTop: 6,
    maxWidth: 220,
  },
  statusTextCompact: {
    marginTop: 0,
    textAlign: 'left',
    width: '100%',
  },
  compactBubble: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    bottom: 54,
    padding: 8,
    position: 'absolute',
    width: 240,
  },
  bubbleLeft: {
    left: 0,
  },
  bubbleRight: {
    right: 0,
  },
  captionText: {
    fontSize: 11,
    marginTop: 2,
  },
  captionUser: {
    color: colors.textSecondary,
  },
  captionAssistant: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
});
