// Central theme tokens for the AI-OS dark orchestration-layer look:
// near-black navy background, blue -> purple gradient accents, light text.
// Every component pulls colors from here instead of hardcoding hex values, so
// the palette stays consistent and swappable in one place.

export const colors = {
  // Surfaces
  background: '#080b14',
  surface: '#0f1524', // cards / panels
  surfaceAlt: '#131a2c', // inputs / nested boxes
  codeBg: '#05070e', // JSON / monospace result blocks

  // Borders
  border: '#1e2740',
  borderStrong: '#2c3860',

  // Text
  textPrimary: '#eef2fb',
  textSecondary: '#9aa4bd',
  textMuted: '#5e6885',
  onAccent: '#ffffff',

  // Brand accents (blue -> purple)
  accent: '#4f7cf6',
  accentPurple: '#8b5cf6',

  // Status: danger (errors)
  danger: '#f4736a',
  dangerText: '#f9a49d',
  dangerBg: '#20121a',
  dangerBorder: '#4a2230',

  // Status: positive (proposed tool call)
  positive: '#5fd1a0',
  positiveBg: '#0d2222',
  positiveBorder: '#1d4a44',

  // Status: info (assistant reply)
  info: '#6ea8fe',
  infoBg: '#0e1c30',
  infoBorder: '#23406a',
} as const;

// Ergonomics (see ../DESIGN.md): every tappable target is at least this many dp, and the controls
// a user touches live in the lower half of the screen.
export const touchTarget = 48;

// Blue -> purple gradient used for the primary action buttons and brand marks.
export const brandGradient = [colors.accent, colors.accentPurple] as const;

// Standard start/end so every gradient runs the same diagonal direction.
export const gradientStart = { x: 0, y: 0 } as const;
export const gradientEnd = { x: 1, y: 1 } as const;
