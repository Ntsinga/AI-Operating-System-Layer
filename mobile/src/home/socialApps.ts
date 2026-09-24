import type { InstalledApp } from '../native/AppManager';

// Known social apps by package id, in the order they should appear. An installed app that isn't
// listed here still shows up when its launcher label contains one of NAME_KEYWORDS (regional
// variants, "Lite" builds). Android's own app-category flag misses many apps, so this stays a
// curated list for now.
const KNOWN_PACKAGES = [
  'com.instagram.android',
  'com.zhiliaoapp.musically',
  'com.ss.android.ugc.trill',
  'com.whatsapp',
  'com.whatsapp.w4b',
  'com.twitter.android',
  'com.facebook.katana',
  'com.facebook.lite',
  'com.facebook.orca',
  'com.snapchat.android',
  'com.linkedin.android',
  'org.telegram.messenger',
  'com.instagram.barcelona',
  'com.reddit.frontpage',
  'com.pinterest',
  'com.discord',
];

const NAME_KEYWORDS = [
  'instagram',
  'tiktok',
  'whatsapp',
  'facebook',
  'messenger',
  'snapchat',
  'linkedin',
  'telegram',
  'reddit',
  'pinterest',
  'discord',
  'threads',
];

const INITIALS: Record<string, string> = {
  instagram: 'IG',
  tiktok: 'TT',
  whatsapp: 'WA',
  facebook: 'FB',
  messenger: 'MS',
  snapchat: 'SC',
  linkedin: 'IN',
  telegram: 'TG',
  reddit: 'RD',
  pinterest: 'PI',
  discord: 'DC',
  threads: 'TH',
};

export function pickSocialApps(apps: InstalledApp[]): InstalledApp[] {
  const ranked: { app: InstalledApp; rank: number }[] = [];
  for (const app of apps) {
    if (!app.launchable) continue;
    const packageRank = KNOWN_PACKAGES.indexOf(app.packageName);
    if (packageRank >= 0) {
      ranked.push({ app, rank: packageRank });
      continue;
    }
    const lower = app.name.toLowerCase();
    const keywordRank = NAME_KEYWORDS.findIndex((keyword) => lower.includes(keyword));
    if (keywordRank >= 0) ranked.push({ app, rank: KNOWN_PACKAGES.length + keywordRank });
  }
  return ranked.sort((a, b) => a.rank - b.rank).map((entry) => entry.app);
}

export function initialsFor(app: InstalledApp): string {
  const lower = app.name.toLowerCase();
  const keyword = Object.keys(INITIALS).find((key) => lower.includes(key));
  return keyword ? INITIALS[keyword] : app.name.trim().slice(0, 2).toUpperCase();
}
