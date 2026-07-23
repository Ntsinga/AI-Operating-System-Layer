import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getAudioRecorderModule } from '../native/AudioRecorder';
import { transcribeAudio } from '../planner/transcribeClient';
import { colors } from '../theme';

type State = 'idle' | 'recording' | 'transcribing';

type Props = {
  onTranscribed: (text: string) => void;
  onError?: (message: string) => void;
};

// A small mic button meant to sit next to a command TextInput: tap to start recording,
// tap again to stop, then it uploads the recording to the backend for transcription
// (gpt-4o-mini-transcribe) and hands the resulting text to onTranscribed. Shows an explicit
// status line the whole time (listening + elapsed seconds, then transcribing) so it is never
// just a silent icon change - the user needs visible confirmation it heard them.
export function VoiceInputButton({ onTranscribed, onError }: Props) {
  const [state, setState] = useState<State>('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  async function handlePress() {
    if (state === 'transcribing') {
      return;
    }

    if (state === 'idle') {
      try {
        await getAudioRecorderModule().startRecording();
        setState('recording');
        setElapsedSeconds(0);
        timerRef.current = setInterval(() => {
          setElapsedSeconds((seconds) => seconds + 1);
        }, 1000);
      } catch (startError) {
        onError?.(startError instanceof Error ? startError.message : 'Failed to start recording.');
      }
      return;
    }

    // state === 'recording' -> stop, upload, transcribe.
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setState('transcribing');
    try {
      const { uri } = await getAudioRecorderModule().stopRecording();
      const text = await transcribeAudio(uri);
      onTranscribed(text);
    } catch (stopError) {
      onError?.(stopError instanceof Error ? stopError.message : 'Failed to transcribe recording.');
    } finally {
      setState('idle');
    }
  }

  const icon = state === 'recording' ? '⏹' : state === 'transcribing' ? '…' : '🎤';
  const statusText =
    state === 'recording'
      ? `● Listening... ${elapsedSeconds}s (tap to stop)`
      : state === 'transcribing'
        ? 'Transcribing...'
        : null;

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={state === 'recording' ? 'Stop recording' : 'Record voice command'}
        disabled={state === 'transcribing'}
        onPress={handlePress}
        style={({ pressed }) => [
          styles.button,
          state === 'recording' && styles.buttonRecording,
          state === 'transcribing' && styles.buttonDisabled,
          pressed && state !== 'transcribing' && styles.buttonPressed,
        ]}
      >
        <Text style={styles.icon}>{icon}</Text>
      </Pressable>
      {statusText ? (
        <Text style={[styles.statusText, state === 'recording' && styles.statusTextRecording]}>
          {statusText}
        </Text>
      ) : null}
    </View>
  );
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
  buttonRecording: {
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
    width: 90,
  },
  statusTextRecording: {
    color: colors.danger,
  },
});
