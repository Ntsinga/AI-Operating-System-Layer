import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark } from '../components/BrandMark';
import { BoardIcon, CameraIcon, MicIcon, RideIcon, SocialIcon, SparkIcon, StudyIcon } from '../components/HomeIcons';
import { SettingsIcon } from '../components/TabIcons';
import {
  EMPTY_RIDE_STATE,
  RIDE_PREF_KEY,
  findRideApps,
  markDeclined,
  markNeverAsk,
  recordPick,
  setDefault,
  shouldOfferDefault,
  type RideState,
} from '../home/rideProviders';
import { initialsFor, pickSocialApps } from '../home/socialApps';
import { getAppManager, type InstalledApp } from '../native/AppManager';
import { getCalendarModule, type CalendarEvent } from '../native/Calendar';
import { getMediaCaptureModule } from '../native/MediaCapture';
import { getPref, setPref } from '../native/Prefs';
import { colors, touchTarget } from '../theme';

type Props = {
  leftHanded: boolean;
  onOpenSettings: () => void;
  // Opens the Boards list (the drawing/visualization surface).
  onOpenBoards: () => void;
  // Opens the chat sheet. With text it runs that command; without, it just focuses the composer.
  onAsk: (text?: string) => void;
  // Opens the chat sheet and starts a live voice session.
  onLive: () => void;
};

const TODAY_PREF_KEY = 'today.enabled';
const STUDY_REQUEST = 'Help me study for my upcoming exam: find my study materials and build a plan.';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// The launcher-style Home screen (see docs/AI_OS_INTENT_LAYER_PLAN.md and DESIGN.md). Read-only
// content sits at the top; everything the user touches sits in the lower half, with the ask bar
// lowest, just above the gesture area.
export function HomeScreen({ leftHanded, onOpenSettings, onOpenBoards, onAsk, onLive }: Props) {
  const insets = useSafeAreaInsets();
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [rideState, setRideState] = useState<RideState>(EMPTY_RIDE_STATE);
  const [picker, setPicker] = useState<null | 'open' | 'default'>(null);
  const [socialOpen, setSocialOpen] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [todayError, setTodayError] = useState<string | null>(null);
  const [todayLoading, setTodayLoading] = useState(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rideApps = useMemo(() => findRideApps(apps), [apps]);
  const socialApps = useMemo(() => pickSocialApps(apps), [apps]);
  const defaultRide = rideApps.find((app) => app.packageName === rideState.defaultPackage) ?? null;

  const flash = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 4000);
  }, []);

  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );

  const loadToday = useCallback(async () => {
    setTodayLoading(true);
    setTodayError(null);
    try {
      const upcoming = await getCalendarModule().getUpcomingEvents(24);
      setEvents([...upcoming].sort((a, b) => a.startEpochMs - b.startEpochMs).slice(0, 3));
      void setPref(TODAY_PREF_KEY, true);
    } catch (error) {
      setTodayError(error instanceof Error ? error.message : 'Could not read your calendar.');
    } finally {
      setTodayLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [storedRide, todayOn] = await Promise.all([
        getPref<RideState>(RIDE_PREF_KEY, EMPTY_RIDE_STATE),
        getPref<boolean>(TODAY_PREF_KEY, false),
      ]);
      if (cancelled) return;
      setRideState({ ...EMPTY_RIDE_STATE, ...storedRide });
      try {
        const installed = await getAppManager().getInstalledApps();
        if (!cancelled) setApps(installed);
      } catch {
        // Native module missing in an old build; the tiles say so when they are used.
      }
      // The calendar permission prompt only appears after the user has asked for Today once.
      if (todayOn && !cancelled) void loadToday();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadToday]);

  function saveRide(next: RideState) {
    setRideState(next);
    void setPref(RIDE_PREF_KEY, next);
  }

  function offerDefault(app: InstalledApp, state: RideState) {
    Alert.alert(
      `Make ${app.name} your default ride?`,
      'Order a ride will open it straight away. Long-press the tile to change it any time.',
      [
        { text: 'Yes', onPress: () => saveRide(setDefault(state, app.packageName)) },
        { text: 'Not now', onPress: () => saveRide(markDeclined(state, Date.now())) },
        { text: 'Never ask', style: 'destructive', onPress: () => saveRide(markNeverAsk(state)) },
      ],
    );
  }

  async function openRide(app: InstalledApp) {
    setPicker(null);
    const next = recordPick(rideState, app.packageName);
    saveRide(next);
    try {
      await getAppManager().openApplication(app.packageName, false);
      if (shouldOfferDefault(next, app.packageName)) offerDefault(app, next);
    } catch (error) {
      flash(error instanceof Error ? error.message : `Could not open ${app.name}.`);
    }
  }

  function onRidePress() {
    if (rideApps.length === 0) {
      flash('No ride app found. Install SafeBoda, Faras, Uber or Bolt.');
    } else if (defaultRide) {
      void openRide(defaultRide);
    } else if (rideApps.length === 1) {
      void openRide(rideApps[0]);
    } else {
      setPicker('open');
    }
  }

  function onRideLongPress() {
    if (rideApps.length > 0) setPicker('default');
  }

  function chooseRide(app: InstalledApp) {
    if (picker === 'default') {
      saveRide(setDefault(rideState, app.packageName));
      setPicker(null);
      flash(`${app.name} is now your default ride.`);
    } else {
      void openRide(app);
    }
  }

  async function takeSelfie() {
    try {
      const capture = getMediaCaptureModule();
      if (typeof capture.takeSelfie !== 'function') {
        flash('Install the latest AI-OS build to use the selfie camera.');
        return;
      }
      // The capture activity confirms with its own "Saved to Gallery" toast.
      await capture.takeSelfie();
    } catch (error) {
      flash(error instanceof Error ? error.message : 'Could not take a selfie.');
    }
  }

  async function openApp(app: InstalledApp) {
    try {
      await getAppManager().openApplication(app.packageName, false);
    } catch (error) {
      flash(error instanceof Error ? error.message : `Could not open ${app.name}.`);
    }
  }

  const suggestions = [`Order a ${defaultRide?.name ?? 'ride'}`, 'Laptops under 1.2m', 'Plan my study'];

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.top}
        contentContainerStyle={[styles.topContent, { paddingTop: insets.top + 8 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <BrandMark size={40} />
          <View style={styles.greetingBlock}>
            <Text style={styles.greeting}>{greeting()}</Text>
            <Text style={styles.date}>
              {new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' })}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            onPress={onOpenSettings}
            style={styles.settingsButton}
          >
            <SettingsIcon color={colors.textSecondary} size={20} />
          </Pressable>
        </View>

        <Text style={styles.sectionLabel}>Today</Text>
        <View style={styles.card}>
          {events === null ? (
            <Pressable
              accessibilityRole="button"
              disabled={todayLoading}
              onPress={() => void loadToday()}
              style={styles.cardRow}
            >
              <Text style={styles.cardAction}>{todayLoading ? 'Reading your calendar...' : "See today's schedule"}</Text>
            </Pressable>
          ) : events.length === 0 ? (
            <View style={styles.cardRow}>
              <Text style={styles.cardMuted}>Nothing scheduled in the next 24 hours.</Text>
            </View>
          ) : (
            events.map((event, index) => (
              <View key={event.eventId} style={[styles.cardRow, index > 0 && styles.cardRowDivider]}>
                <Text style={styles.eventTime}>{event.allDay ? 'All day' : formatTime(event.startEpochMs)}</Text>
                <Text style={styles.eventTitle} numberOfLines={1}>
                  {event.title}
                </Text>
              </View>
            ))
          )}
          {todayError ? <Text style={styles.errorText}>{todayError}</Text> : null}
        </View>
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        {picker ? (
          <View style={styles.picker}>
            <Text style={styles.pickerTitle}>{picker === 'default' ? 'Choose your default ride' : 'Which ride app?'}</Text>
            {rideApps.map((app) => (
              <Pressable key={app.packageName} accessibilityRole="button" onPress={() => chooseRide(app)} style={styles.pickerRow}>
                <Text style={styles.pickerText}>{app.name}</Text>
                {app.packageName === rideState.defaultPackage ? <Text style={styles.pickerBadge}>Default</Text> : null}
              </Pressable>
            ))}
            <Pressable accessibilityRole="button" onPress={() => setPicker(null)} style={styles.pickerRow}>
              <Text style={styles.cardMuted}>Cancel</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.tileRow}>
          <Tile
            icon={<CameraIcon color={colors.accent} />}
            title="Take selfie"
            subtitle="Front camera"
            onPress={() => void takeSelfie()}
          />
          <Tile
            icon={<RideIcon color={colors.accent} />}
            title="Order a ride"
            subtitle={
              defaultRide
                ? `Usual: ${defaultRide.name}`
                : rideApps.length === 0
                  ? 'No ride app found'
                  : 'Choose your app'
            }
            sparkle={defaultRide !== null}
            onPress={onRidePress}
            onLongPress={onRideLongPress}
          />
        </View>
        <View style={styles.tileRow}>
          <Tile
            icon={<SocialIcon color={colors.accent} />}
            title="Open social"
            subtitle="Swipe to pick"
            selected={socialOpen}
            onPress={() => setSocialOpen((open) => !open)}
          />
          <Tile
            icon={<StudyIcon color={colors.accent} />}
            title="Study for exam"
            subtitle="Plan with AI"
            onPress={() => onAsk(STUDY_REQUEST)}
          />
        </View>
        <View style={styles.tileRow}>
          <Tile
            icon={<BoardIcon color={colors.accent} />}
            title="Board"
            subtitle="Draw and ask AI"
            onPress={onOpenBoards}
          />
        </View>

        {socialOpen ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.strip}
            keyboardShouldPersistTaps="handled"
          >
            {socialApps.length === 0 ? (
              <Text style={styles.cardMuted}>No social apps found on this phone.</Text>
            ) : (
              socialApps.map((app) => (
                <Pressable
                  key={app.packageName}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${app.name}`}
                  onPress={() => void openApp(app)}
                  style={styles.socialCell}
                >
                  <View style={styles.socialCircle}>
                    <Text style={styles.socialInitials}>{initialsFor(app)}</Text>
                  </View>
                  <Text style={styles.socialName} numberOfLines={1}>
                    {app.name}
                  </Text>
                </Pressable>
              ))
            )}
          </ScrollView>
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          keyboardShouldPersistTaps="handled"
        >
          {suggestions.map((text) => (
            <Pressable
              key={text}
              accessibilityRole="button"
              hitSlop={{ top: 4, bottom: 4 }}
              onPress={() => onAsk(text)}
              style={styles.chip}
            >
              <Text style={styles.chipText}>{text}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={[styles.askBar, leftHanded && styles.askBarLeft]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ask AI-OS"
            onPress={() => onAsk()}
            style={styles.askField}
          >
            <SparkIcon color={colors.accent} size={16} />
            <Text style={styles.askPlaceholder}>Ask or say anything</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Talk to AI-OS"
            onPress={onLive}
            style={styles.micButton}
          >
            <MicIcon color={colors.onAccent} size={20} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

type TileProps = {
  icon: ReactNode;
  title: string;
  subtitle: string;
  selected?: boolean;
  // Marks something the AI chose or learned.
  sparkle?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
};

function Tile({ icon, title, subtitle, selected, sparkle, onPress, onLongPress }: TileProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${subtitle}`}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.tile, selected && styles.tileSelected, pressed && styles.pressed]}
    >
      <View style={styles.tileIcon}>{icon}</View>
      <View style={styles.tileText}>
        <Text style={styles.tileTitle} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.tileSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {sparkle ? (
        <View style={styles.tileSpark}>
          <SparkIcon color={colors.accent} size={12} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  top: {
    flex: 1,
  },
  topContent: {
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  greetingBlock: {
    flex: 1,
  },
  greeting: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 28,
  },
  date: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  settingsButton: {
    alignItems: 'center',
    height: touchTarget,
    justifyContent: 'center',
    width: touchTarget,
  },
  sectionLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
  },
  cardRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: touchTarget,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  cardRowDivider: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  cardAction: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '700',
  },
  cardMuted: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  eventTime: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    minWidth: 56,
  },
  eventTitle: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: 15,
  },
  errorText: {
    color: colors.dangerText,
    fontSize: 13,
    lineHeight: 19,
    paddingBottom: 12,
    paddingHorizontal: 14,
  },
  bottom: {
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  notice: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  picker: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  pickerTitle: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    paddingTop: 10,
    textTransform: 'uppercase',
  },
  pickerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: touchTarget,
  },
  pickerText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  pickerBadge: {
    color: colors.positive,
    fontSize: 12,
    fontWeight: '800',
  },
  tileRow: {
    flexDirection: 'row',
    gap: 8,
  },
  tile: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 60,
    padding: 12,
  },
  tileSelected: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.accent,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  tileIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
  },
  tileText: {
    flex: 1,
  },
  tileTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  tileSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  tileSpark: {
    position: 'absolute',
    right: 10,
    top: 8,
  },
  strip: {
    alignItems: 'center',
    gap: 8,
  },
  socialCell: {
    alignItems: 'center',
    gap: 4,
    minWidth: 64,
    paddingVertical: 4,
  },
  socialCircle: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.borderStrong,
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  socialInitials: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  socialName: {
    color: colors.textSecondary,
    fontSize: 12,
    maxWidth: 64,
  },
  chipRow: {
    alignItems: 'center',
    gap: 8,
  },
  chip: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.borderStrong,
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  askBar: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.borderStrong,
    borderRadius: 30,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 56,
    padding: 5,
  },
  askBarLeft: {
    flexDirection: 'row-reverse',
  },
  askField: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: touchTarget,
    paddingHorizontal: 12,
  },
  askPlaceholder: {
    color: colors.textSecondary,
    fontSize: 15,
  },
  micButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: 23,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
});
