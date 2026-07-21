import { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';

import { getOverlayModule } from '../native/Overlay';
import { getVoiceActivationModule } from '../native/VoiceActivation';
import { colors } from '../theme';
import { GradientButton } from './GradientButton';

type Status = 'checking' | 'permission_needed' | 'stopped' | 'running';

// Controls the floating overlay bubble (Phase 3.5 Step 1): shows permission state, and
// starts/stops the foreground service that hosts the bubble. Re-checks on every app-foreground
// event so returning from the "Display over other apps" Settings screen updates automatically.
export function OverlayControlCard() {
  const [status, setStatus] = useState<Status>('checking');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const hasPermission = await getOverlayModule().hasOverlayPermission();
      if (!hasPermission) {
        setStatus('permission_needed');
        return;
      }
      const active = await getOverlayModule().isOverlayActive();
      setStatus(active ? 'running' : 'stopped');
      setVoiceActive(await getVoiceActivationModule().isVoiceActivationActive());
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Failed to check overlay status.');
    }
  }, []);

  useEffect(() => {
    refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refresh();
      }
    });
    return () => subscription.remove();
  }, [refresh]);

  async function handleGrantPermission() {
    setError(null);
    try {
      await getOverlayModule().requestOverlayPermission();
      // User is being sent to a system Settings screen; status refreshes via the
      // AppState "active" listener above when they return.
    } catch (grantError) {
      setError(grantError instanceof Error ? grantError.message : 'Failed to open overlay permission screen.');
    }
  }

  async function handleStart() {
    setBusy(true);
    setError(null);
    try {
      await getOverlayModule().startOverlay();
      setStatus('running');
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : 'Failed to start the overlay.');
    } finally {
      setBusy(false);
    }
  }

  async function handleStop() {
    setBusy(true);
    setError(null);
    try {
      await getOverlayModule().stopOverlay();
      setStatus('stopped');
    } catch (stopError) {
      setError(stopError instanceof Error ? stopError.message : 'Failed to stop the overlay.');
    } finally {
      setBusy(false);
    }
  }

  async function handleVoiceStart() {
    setVoiceBusy(true);
    setError(null);
    try {
      await getVoiceActivationModule().startVoiceActivation();
      setVoiceActive(true);
    } catch (voiceError) {
      setError(voiceError instanceof Error ? voiceError.message : 'Failed to enable voice activation.');
    } finally {
      setVoiceBusy(false);
    }
  }

  async function handleVoiceStop() {
    setVoiceBusy(true);
    setError(null);
    try {
      await getVoiceActivationModule().stopVoiceActivation();
      setVoiceActive(false);
    } catch (voiceError) {
      setError(voiceError instanceof Error ? voiceError.message : 'Failed to stop voice activation.');
    } finally {
      setVoiceBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.info}>
        <Text style={styles.name}>Floating overlay</Text>
        <Text style={styles.description}>
          Shows a draggable AI-OS bubble above every app. Tap it to jump back into this app.
          Runs as a foreground service with a persistent "AI-OS is active" notification while on.
        </Text>
      </View>

      <View style={styles.voiceSection}>
        <Text style={styles.voiceName}>Voice activation · “Hey Casper”</Text>
        <Text style={styles.description}>
          Opt-in microphone listener. Say “Hey Casper, ...” to send a command into the assistant,
          or say “Hey Casper” and wait for the next sentence.
        </Text>
        {voiceActive ? (
          <>
            <Text style={styles.statusRunning}>● Voice activation is listening</Text>
            <GradientButton label={voiceBusy ? 'Stopping...' : 'Disable voice activation'} disabled={voiceBusy} onPress={handleVoiceStop} />
          </>
        ) : (
          <GradientButton label={voiceBusy ? 'Enabling...' : 'Enable “Hey Casper”'} disabled={voiceBusy} onPress={handleVoiceStart} />
        )}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {status === 'checking' ? <Text style={styles.statusText}>Checking permission...</Text> : null}

      {status === 'permission_needed' ? (
        <>
          <Text style={styles.statusText}>
            Needs "Display over other apps" permission - not a runtime dialog, this opens a
            system Settings screen.
          </Text>
          <GradientButton label="Grant permission" onPress={handleGrantPermission} />
        </>
      ) : null}

      {status === 'stopped' ? (
        <GradientButton label={busy ? 'Starting...' : 'Start overlay'} disabled={busy} onPress={handleStart} />
      ) : null}

      {status === 'running' ? (
        <>
          <Text style={styles.statusRunning}>● Overlay is active</Text>
          <GradientButton label={busy ? 'Stopping...' : 'Stop overlay'} disabled={busy} onPress={handleStop} />
        </>
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
  voiceSection: {
    borderColor: colors.border,
    borderTopWidth: 1,
    marginBottom: 14,
    paddingTop: 14,
  },
  voiceName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },
  name: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  description: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  statusText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  statusRunning: {
    color: colors.positive,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 12,
  },
  error: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.dangerText,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
    padding: 10,
  },
});
