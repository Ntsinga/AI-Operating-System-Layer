const DEFAULT_BACKEND_BASE_URL = 'https://ai-operating-system-layer.onrender.com';

export const BACKEND_BASE_URL =
  process.env.EXPO_PUBLIC_BACKEND_BASE_URL?.replace(/\/+$/, '') ?? DEFAULT_BACKEND_BASE_URL;

// Same host as BACKEND_BASE_URL, ws(s) scheme - for the live-voice audio socket
// (native/LiveVoice.ts -> backend's /live/ws, see backend/app/live_voice.py).
export const BACKEND_WS_BASE_URL = BACKEND_BASE_URL.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
