import { AppState, StyleSheet, Text, View } from 'react-native';
import { useCallback, useEffect, useState } from 'react';

import { getAudioRecorderModule } from '../native/AudioRecorder';
import { getOverlayModule } from '../native/Overlay';
import { getVoiceActivationModule, type VoiceSetupStatus } from '../native/VoiceActivation';
import { transcribeAudio } from '../planner/transcribeClient';
import { colors } from '../theme';
import { GradientButton } from './GradientButton';

type CalibrationState = 'idle' | 'recording' | 'transcribing';
type VoiceProfile = 'low' | 'high';

const WAKE_PHRASE_VARIANTS = ['hey casper', 'hey kasper', 'hey caspar', 'hey asper'];

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function containsWakePhrase(text: string): boolean {
  const normalized = normalize(text);
  return WAKE_PHRASE_VARIANTS.some((phrase) => normalized.includes(phrase));
}

export function ActivationSetupCard() {
  const [status, setStatus] = useState<VoiceSetupStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [calibrationState, setCalibrationState] = useState<CalibrationState>('idle');
  const [profile, setProfile] = useState<VoiceProfile>('low');
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await getVoiceActivationModule().getSetupStatus();
      setStatus(next);

      // Once the user has approved Android's permissions and calibrated, the assistant resumes
      // automatically whenever the app comes back to the foreground.
      if (next.hasOverlayPermission && next.calibrationComplete) {
        if (!next.overlayActive) await getOverlayModule().startOverlay();
        if (next.hasMicPermission && !next.voiceActive) await getVoiceActivationModule().startVoiceActivation();
        setStatus(await getVoiceActivationModule().getSetupStatus());
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to read activation status.');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  async function enableActivation() {
    setBusy(true);
    setMessage(null);
    try {
      const current = status ?? (await getVoiceActivationModule().getSetupStatus());
      if (!current.hasOverlayPermission) {
        await getOverlayModule().requestOverlayPermission();
        setMessage('Turn on “Display over other apps”, then return here. AI-OS will continue automatically.');
        return;
      }
      if (!current.calibrationComplete) {
        setMessage('Record “Hey Casper” once below so AI-OS can verify your preferred wake phrase.');
        return;
      }
      await getOverlayModule().startOverlay();
      await getVoiceActivationModule().startVoiceActivation();
      setStatus(await getVoiceActivationModule().getSetupStatus());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not enable Hey Casper.');
    } finally {
      setBusy(false);
    }
  }

  async function calibrate() {
    if (calibrationState === 'transcribing') return;
    setMessage(null);
    if (calibrationState === 'idle') {
      try {
        await getAudioRecorderModule().startRecording();
        setCalibrationState('recording');
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Could not start calibration recording.');
      }
      return;
    }

    setCalibrationState('transcribing');
    try {
      const recording = await getAudioRecorderModule().stopRecording();
      const transcript = await transcribeAudio(recording.uri);
      if (!containsWakePhrase(transcript)) {
        throw new Error(`I heard “${transcript || 'nothing'}”. Please record the words “Hey Casper”.`);
      }
      await getVoiceActivationModule().saveWakePhraseSample(recording.path, transcript, profile);
      if (profile === 'low') {
        setProfile('high');
        setMessage('Low-tone sample saved. Now say “Hey Casper” in your natural higher tone.');
      } else {
        setMessage('Both voice ranges saved. The bubble will react when it hears Hey Casper.');
      }
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save the wake phrase sample.');
    } finally {
      setCalibrationState('idle');
    }
  }

  const ready = Boolean(status?.hasOverlayPermission && status?.hasMicPermission && status?.calibrationComplete);
  const calibrated = Boolean(status?.calibrationComplete);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Hey Casper setup</Text>
      <Text style={styles.description}>
        One setup enables the bubble and hands-free listening. Android will only interrupt you for
        permissions it cannot grant automatically.
      </Text>

      <View style={styles.statusRow}>
        <Text style={styles.statusLabel}>Bubble</Text>
        <Text style={status?.hasOverlayPermission ? styles.good : styles.pending}>
          {status?.hasOverlayPermission ? 'Permission ready' : 'Permission needed'}
        </Text>
      </View>
      <View style={styles.statusRow}>
        <Text style={styles.statusLabel}>Microphone</Text>
        <Text style={status?.hasMicPermission ? styles.good : styles.pending}>
          {status?.hasMicPermission ? 'Permission ready' : 'Permission needed'}
        </Text>
      </View>
      <View style={styles.statusRow}>
        <Text style={styles.statusLabel}>Wake phrase</Text>
        <Text style={calibrated ? styles.good : styles.pending}>{calibrated ? 'Calibrated' : 'One recording needed'}</Text>
      </View>

      {!calibrated ? (
        <>
          <Text style={styles.instruction}>
            {profile === 'low'
              ? 'First, say “Hey Casper” in your comfortable lower speaking tone, then tap stop.'
              : 'Now say “Hey Casper” in your natural higher speaking tone, then tap stop.'}
          </Text>
          <GradientButton
            label={calibrationState === 'recording' ? 'Stop and verify recording' : 'Record “Hey Casper”'}
            disabled={calibrationState === 'transcribing'}
            onPress={() => void calibrate()}
          />
        </>
      ) : null}

      {!ready ? (
        <GradientButton label={busy ? 'Enabling...' : 'Enable bubble + voice'} disabled={busy} onPress={() => void enableActivation()} />
      ) : (
        <Text style={styles.ready}>● Hey Casper is active. The bubble will pulse when it hears you.</Text>
      )}
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 14, borderWidth: 1, marginBottom: 16, padding: 16 },
  title: { color: colors.textPrimary, fontSize: 17, fontWeight: '900', marginBottom: 5 },
  description: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 12 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  statusLabel: { color: colors.textSecondary, fontSize: 13 },
  good: { color: colors.positive, fontSize: 13, fontWeight: '800' },
  pending: { color: '#F6B84F', fontSize: 13, fontWeight: '800' },
  instruction: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginBottom: 8, marginTop: 8 },
  ready: { color: colors.positive, fontSize: 13, fontWeight: '800', lineHeight: 19, marginTop: 8 },
  message: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 10 },
});
