const DEFAULT_BACKEND_BASE_URL = 'https://ai-operating-system-layer.onrender.com';

export const BACKEND_BASE_URL =
  process.env.EXPO_PUBLIC_BACKEND_BASE_URL?.replace(/\/+$/, '') ?? DEFAULT_BACKEND_BASE_URL;
