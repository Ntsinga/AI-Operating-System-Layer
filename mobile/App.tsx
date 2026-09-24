import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, BackHandler, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatSheet } from './src/components/ChatSheet';
import { resumeAssistantIfPermitted } from './src/native/assistantResume';
import { getPref, setPref } from './src/native/Prefs';
import { BoardsListScreen } from './src/screens/BoardsListScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { colors, touchTarget } from './src/theme';

const LEFT_HANDED_PREF_KEY = 'layout.leftHanded';

export default function App() {
  return (
    <SafeAreaProvider>
      <Shell />
    </SafeAreaProvider>
  );
}

// Home is the root screen. Chat is a sheet that rises from the Home ask bar (no Chat tab, no
// bottom navigation), and Settings opens from the Home header. See docs/AI_OS_INTENT_LAYER_PLAN.md.
function Shell() {
  const insets = useSafeAreaInsets();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [boardsOpen, setBoardsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatCommand, setChatCommand] = useState<string | null>(null);
  const [liveRequested, setLiveRequested] = useState(false);
  const [focusToken, setFocusToken] = useState(0);
  const [leftHanded, setLeftHanded] = useState(false);

  const openChat = useCallback((options?: { command?: string; live?: boolean; focus?: boolean }) => {
    setSettingsOpen(false);
    if (options?.command) setChatCommand(options.command);
    if (options?.live) setLiveRequested(true);
    if (options?.focus) setFocusToken((token) => token + 1);
    setChatOpen(true);
  }, []);
  const closeChat = useCallback(() => setChatOpen(false), []);
  const consumeCommand = useCallback(() => setChatCommand(null), []);
  const consumeLive = useCallback(() => setLiveRequested(false), []);

  const changeLeftHanded = useCallback((value: boolean) => {
    setLeftHanded(value);
    void setPref(LEFT_HANDED_PREF_KEY, value);
  }, []);

  useEffect(() => {
    void getPref<boolean>(LEFT_HANDED_PREF_KEY, false).then(setLeftHanded);
  }, []);

  // Keeps "Hey Casper" and the overlay resuming on launch and every return to the foreground. This
  // used to happen only because the Chat tab (and its ActivationSetupCard) was always mounted.
  useEffect(() => {
    const resume = () => {
      resumeAssistantIfPermitted().catch(() => undefined);
    };
    resume();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') resume();
    });
    return () => subscription.remove();
  }, []);

  // Back closes the top layer first: the chat sheet, then Settings.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (chatOpen) {
        setChatOpen(false);
        return true;
      }
      if (settingsOpen) {
        setSettingsOpen(false);
        return true;
      }
      if (boardsOpen) {
        setBoardsOpen(false);
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [chatOpen, settingsOpen, boardsOpen]);

  useEffect(() => {
    function commandFromUrl(url: string | null): string | null {
      if (!url) return null;
      const match = url.match(/[?&]command=([^&]*)/);
      return match ? decodeURIComponent(match[1].replace(/\+/g, ' ')) : null;
    }

    // VoiceActivationService.kt's launchLiveVoice() deep-links here (aios://voice?live=1)
    // after "Hey Casper" instead of the old one-shot SpeechRecognizer command - see
    // WorkflowCard.tsx's liveVoiceRequested prop.
    function isLiveVoiceUrl(url: string | null): boolean {
      return !!url && /[?&]live=1(?:&|$)/.test(url);
    }

    // backend/app/main.py's /connect/google/callback redirects here (aios://google-connected)
    // after the user finishes Google's consent screen in the browser, since the OS otherwise
    // leaves them stranded on a plain response page with no way back into the app.
    function handleGoogleConnectedUrl(url: string | null): boolean {
      if (!url || !url.includes('google-connected')) return false;
      const status = url.match(/[?&]status=([^&]*)/)?.[1];
      const message = url.match(/[?&]message=([^&]*)/)?.[1];
      if (status === 'success') {
        Alert.alert('Google account connected', 'Gmail, Calendar, and Drive access is ready.');
      } else {
        Alert.alert('Google connection failed', message ? decodeURIComponent(message.replace(/\+/g, ' ')) : 'Please try again.');
      }
      setChatOpen(false);
      setSettingsOpen(true);
      return true;
    }

    function routeUrl(url: string | null) {
      if (handleGoogleConnectedUrl(url)) return;
      const command = commandFromUrl(url);
      if (command) openChat({ command });
      else if (isLiveVoiceUrl(url)) openChat({ live: true });
    }

    Linking.getInitialURL().then(routeUrl);
    const subscription = Linking.addEventListener('url', ({ url }) => routeUrl(url));
    return () => subscription.remove();
  }, [openChat]);

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />

      {settingsOpen ? (
        <View style={styles.settings}>
          <View style={[styles.settingsHeader, { paddingTop: insets.top + 8 }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to Home"
              onPress={() => setSettingsOpen(false)}
              style={styles.backButton}
            >
              <Text style={styles.backText}>Back</Text>
            </Pressable>
            <Text style={styles.settingsTitle}>Settings</Text>
          </View>
          <View style={[styles.settingsBody, { paddingBottom: insets.bottom }]}>
            <SettingsScreen leftHanded={leftHanded} onLeftHandedChange={changeLeftHanded} />
          </View>
        </View>
      ) : boardsOpen ? (
        <BoardsListScreen onBack={() => setBoardsOpen(false)} />
      ) : (
        <HomeScreen
          leftHanded={leftHanded}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenBoards={() => {
            setSettingsOpen(false);
            setBoardsOpen(true);
          }}
          onAsk={(text) => openChat(text ? { command: text } : { focus: true })}
          onLive={() => openChat({ live: true })}
        />
      )}

      <ChatSheet
        open={chatOpen}
        onClose={closeChat}
        command={chatCommand}
        onCommandConsumed={consumeCommand}
        liveVoiceRequested={liveRequested}
        onLiveVoiceConsumed={consumeLive}
        leftHanded={leftHanded}
        focusToken={focusToken}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  settings: {
    flex: 1,
  },
  settingsHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    paddingBottom: 8,
    paddingHorizontal: 12,
  },
  backButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: touchTarget,
    minWidth: touchTarget,
    paddingHorizontal: 8,
  },
  backText: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '700',
  },
  settingsTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    marginLeft: 4,
  },
  settingsBody: {
    flex: 1,
    paddingHorizontal: 20,
  },
});
