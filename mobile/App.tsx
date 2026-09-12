import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BottomNav, type TabKey } from './src/components/BottomNav';
import { BrandMark } from './src/components/BrandMark';
import { ChatScreen } from './src/screens/ChatScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { colors } from './src/theme';

export default function App() {
  const [tab, setTab] = useState<TabKey>('chat');
  const [voiceCommand, setVoiceCommand] = useState<string | null>(null);
  const [liveVoiceRequested, setLiveVoiceRequested] = useState(false);

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
      setTab('settings');
      return true;
    }

    Linking.getInitialURL().then((url) => {
      if (handleGoogleConnectedUrl(url)) return;
      const command = commandFromUrl(url);
      if (command) setVoiceCommand(command);
      else if (isLiveVoiceUrl(url)) setLiveVoiceRequested(true);
    });

    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (handleGoogleConnectedUrl(url)) return;
      const command = commandFromUrl(url);
      if (command) {
        setTab('chat');
        setVoiceCommand(command);
      } else if (isLiveVoiceUrl(url)) {
        setTab('chat');
        setLiveVoiceRequested(true);
      }
    });
    return () => subscription.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <View style={styles.screen}>
        <StatusBar style="light" />

        <View style={styles.header}>
          <BrandMark size={36} />
          <View>
            <Text style={styles.wordmark}>AI-OS</Text>
            <Text style={styles.eyebrow}>Phone Orchestration Layer</Text>
          </View>
        </View>

        <View style={styles.body}>
          {tab === 'chat' ? (
            <ChatScreen
              voiceCommand={voiceCommand}
              onVoiceCommandConsumed={() => setVoiceCommand(null)}
              liveVoiceRequested={liveVoiceRequested}
              onLiveVoiceRequestConsumed={() => setLiveVoiceRequested(false)}
            />
          ) : (
            <SettingsScreen />
          )}
        </View>

        <BottomNav active={tab} onChange={setTab} />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
  },
  wordmark: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 1.5,
    lineHeight: 28,
  },
  eyebrow: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.3,
    marginTop: 1,
    textTransform: 'uppercase',
  },
  body: {
    flex: 1,
    paddingHorizontal: 20,
  },
});
