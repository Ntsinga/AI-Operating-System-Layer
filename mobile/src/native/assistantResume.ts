import { getOverlayModule } from './Overlay';
import { getVoiceActivationModule, type VoiceSetupStatus } from './VoiceActivation';

// Brings the overlay and the "Hey Casper" listener back once the user has already granted the
// permissions and finished setup. This used to run only because the Chat tab (and its
// ActivationSetupCard) was always mounted; the shell now calls it directly on launch and on every
// return to the foreground, so wake-word resume no longer depends on which screen is showing.
export async function resumeAssistantIfPermitted(): Promise<VoiceSetupStatus> {
  const voice = getVoiceActivationModule();
  const status = await voice.getSetupStatus();
  if (!status.hasOverlayPermission) return status;

  if (!status.overlayActive) await getOverlayModule().startOverlay();
  if (status.hasMicPermission && !status.voiceActive) await voice.startVoiceActivation();
  return voice.getSetupStatus();
}
