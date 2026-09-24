import type { InstalledApp } from '../native/AppManager';

// Ride apps are matched by their launcher label rather than hardcoded package ids: the label is
// stable across regional builds, and the planner already gets real package names from
// get_installed_apps. Driver, food-delivery and business variants are excluded.
const RIDE_KEYWORDS = ['safeboda', 'faras', 'uber', 'bolt'];
const RIDE_EXCLUDED = ['eats', 'food', 'driver', 'courier', 'business', 'partner'];

export function findRideApps(apps: InstalledApp[]): InstalledApp[] {
  const matches: { app: InstalledApp; rank: number }[] = [];
  for (const app of apps) {
    if (!app.launchable) continue;
    const name = app.name.toLowerCase();
    if (RIDE_EXCLUDED.some((word) => name.includes(word))) continue;
    const rank = RIDE_KEYWORDS.findIndex((keyword) => name.includes(keyword));
    if (rank >= 0) matches.push({ app, rank });
  }
  return matches.sort((a, b) => a.rank - b.rank).map((match) => match.app);
}

export const RIDE_PREF_KEY = 'ride.v1';

export type RideState = {
  defaultPackage: string | null;
  // Package names of recent picks, oldest first.
  picks: string[];
  neverAsk: boolean;
  // Epoch ms of the last "Not now" on the default prompt.
  declinedAt: number | null;
};

export const EMPTY_RIDE_STATE: RideState = { defaultPackage: null, picks: [], neverAsk: false, declinedAt: null };

const MAX_PICKS = 20;
// A default is proposed once the same app is in at least MIN_IN_WINDOW of the last WINDOW picks.
const WINDOW = 5;
const MIN_IN_WINDOW = 3;
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export function recordPick(state: RideState, packageName: string): RideState {
  return { ...state, picks: [...state.picks, packageName].slice(-MAX_PICKS) };
}

// Learn cautiously: propose, never switch silently. No prompt when a default exists, when the user
// said never, or within a week of a "Not now".
export function shouldOfferDefault(state: RideState, packageName: string, now: number = Date.now()): boolean {
  if (state.neverAsk || state.defaultPackage) return false;
  if (state.declinedAt !== null && now - state.declinedAt < COOLDOWN_MS) return false;
  const recent = state.picks.slice(-WINDOW);
  return recent.filter((pick) => pick === packageName).length >= MIN_IN_WINDOW;
}

export function setDefault(state: RideState, packageName: string): RideState {
  return { ...state, defaultPackage: packageName };
}

export function markDeclined(state: RideState, now: number): RideState {
  return { ...state, declinedAt: now };
}

export function markNeverAsk(state: RideState): RideState {
  return { ...state, neverAsk: true };
}
