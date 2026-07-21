import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { BottomNav, type TabKey } from './src/components/BottomNav';
import { BrandMark } from './src/components/BrandMark';
import { ChatScreen } from './src/screens/ChatScreen';
import { ToolsScreen } from './src/screens/ToolsScreen';
import { colors } from './src/theme';

export default function App() {
  const [tab, setTab] = useState<TabKey>('chat');
  const [voiceCommand, setVoiceCommand] = useState<string | null>(null);

  useEffect(() => {
    function commandFromUrl(url: string | null): string | null {
      if (!url) return null;
      const match = url.match(/[?&]command=([^&]*)/);
      return match ? decodeURIComponent(match[1].replace(/\+/g, ' ')) : null;
    }

    Linking.getInitialURL().then((url) => {
      const command = commandFromUrl(url);
      if (command) setVoiceCommand(command);
    });

    const subscription = Linking.addEventListener('url', ({ url }) => {
      const command = commandFromUrl(url);
      if (command) {
        setTab('chat');
        setVoiceCommand(command);
      }
    });
    return () => subscription.remove();
  }, []);

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <BrandMark size={36} />
        <View>
          <Text style={styles.wordmark}>AI-OS</Text>
          <Text style={styles.eyebrow}>Phone Orchestration Layer</Text>
        </View>
      </View>

      <View style={styles.body}>{tab === 'chat' ? <ChatScreen voiceCommand={voiceCommand} /> : <ToolsScreen />}</View>

      <BottomNav active={tab} onChange={setTab} />
    </View>
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
