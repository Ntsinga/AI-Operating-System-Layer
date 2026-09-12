import { NativeEventEmitter, NativeModules } from 'react-native';

import { BACKEND_WS_BASE_URL } from '../config/backend';
import type { InstalledApp } from './AppManager';

// Native full-duplex audio session for the GPT-Live-1 voice layer (backend/app/live_voice.py).
// The native module owns mic capture, speaker playback, and the WebSocket to the backend's
// /live/ws - JS only starts/stops it and reacts to the events below. See
// LiveVoiceButton.tsx for the UI, and WorkflowCard.tsx for how proposedTool events are
// turned into the same confirm-card / auto-execute / resumeWorkflow flow the typed-command
// path already uses.
type LiveVoiceNativeModule = {
  startSession: (wsUrl: string, initPayload: string) => Promise<boolean>;
  stopSession: () => Promise<boolean>;
  isSessionActive: () => Promise<boolean>;
};

export type ProposedToolEvent = {
  threadId: string;
  proposedTool: { toolName: string; arguments: Record<string, unknown> };
};

export type CaptionEvent = {
  speaker: 'user' | 'assistant';
  text: string;
};

export type LiveVoiceListeners = {
  onProposedTool?: (event: ProposedToolEvent) => void;
  onCaption?: (event: CaptionEvent) => void;
  onSessionEnded?: (event: { reason?: string }) => void;
  onError?: (event: { message: string }) => void;
};

const { AiosLiveVoice } = NativeModules as { AiosLiveVoice?: LiveVoiceNativeModule };

function getModule(): LiveVoiceNativeModule {
  if (!AiosLiveVoice) {
    throw new Error('AiosLiveVoice native module is unavailable. Run an Android native build after prebuild.');
  }
  return AiosLiveVoice;
}

let emitter: NativeEventEmitter | null = null;
function getEmitter(): NativeEventEmitter {
  if (!emitter) {
    emitter = new NativeEventEmitter(AiosLiveVoice as never);
  }
  return emitter;
}

// Subscribes to all live-voice events at once and returns a single unsubscribe function -
// callers don't have to track four separate NativeEventEmitter subscriptions by hand.
export function subscribeLiveVoice(listeners: LiveVoiceListeners): () => void {
  const subscriptions = [
    listeners.onProposedTool && getEmitter().addListener('AiosLiveVoice:onProposedTool', listeners.onProposedTool),
    listeners.onCaption && getEmitter().addListener('AiosLiveVoice:onCaption', listeners.onCaption),
    listeners.onSessionEnded && getEmitter().addListener('AiosLiveVoice:onSessionEnded', listeners.onSessionEnded),
    listeners.onError && getEmitter().addListener('AiosLiveVoice:onError', listeners.onError),
  ].filter((subscription): subscription is NonNullable<typeof subscription> => Boolean(subscription));

  return () => subscriptions.forEach((subscription) => subscription.remove());
}

// tools comes from tools/openAiSchema.ts's buildOpenAiToolSchemas() - the exact same
// schema startWorkflow() sends today, just handed to the backend once up front instead
// of on every HTTP call, since a live session has no per-turn request to attach it to.
export function startLiveVoiceSession(
  tools: unknown[],
  installedApps: InstalledApp[] | undefined,
  deviceId = 'local'
): Promise<boolean> {
  const initPayload = JSON.stringify({ tools, installedApps, deviceId });
  return getModule().startSession(`${BACKEND_WS_BASE_URL}/live/ws`, initPayload);
}

export function stopLiveVoiceSession(): Promise<boolean> {
  return getModule().stopSession();
}

export function isLiveVoiceSessionActive(): Promise<boolean> {
  return getModule().isSessionActive();
}
