import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { InstalledApp } from './src/native/AppManager';
import { tools } from './src/tools/registry';

const installedAppsTool = tools.find((tool) => tool.name === 'get_installed_apps');

export default function App() {
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function runInstalledAppsTool() {
    if (!installedAppsTool) {
      setError('get_installed_apps is not registered.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await installedAppsTool.execute();
      setApps(result);
    } catch (toolError) {
      setError(toolError instanceof Error ? toolError.message : 'Failed to run get_installed_apps.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="auto" />
      <View style={styles.header}>
        <Text style={styles.eyebrow}>AI-OS tool bench</Text>
        <Text style={styles.title}>Phone capability layer</Text>
        <Text style={styles.subtitle}>Run the first native Android tool and inspect the device surface.</Text>
      </View>

      <View style={styles.toolCard}>
        <View style={styles.toolInfo}>
          <Text style={styles.toolName}>{installedAppsTool?.name}</Text>
          <Text style={styles.toolDescription}>{installedAppsTool?.description}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={isLoading}
          onPress={runInstalledAppsTool}
          style={({ pressed }) => [
            styles.runButton,
            isLoading && styles.runButtonDisabled,
            pressed && !isLoading && styles.runButtonPressed,
          ]}
        >
          <Text style={styles.runButtonText}>{isLoading ? 'Running...' : 'Run tool'}</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.resultsHeader}>
        <Text style={styles.resultsTitle}>Installed apps</Text>
        <Text style={styles.resultsCount}>{apps.length}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.resultsList}>
        {apps.map((app) => (
          <View key={app.packageName} style={styles.appRow}>
            <View style={styles.appInitial}>
              <Text style={styles.appInitialText}>{app.name.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={styles.appDetails}>
              <Text style={styles.appName}>{app.name}</Text>
              <Text style={styles.packageName}>{app.packageName}</Text>
            </View>
          </View>
        ))}
        {apps.length === 0 && !error ? (
          <Text style={styles.emptyState}>Run the tool to list launchable Android apps.</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f7f4ef',
    paddingHorizontal: 20,
    paddingTop: 64,
  },
  header: {
    marginBottom: 24,
  },
  eyebrow: {
    color: '#5f6f52',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  title: {
    color: '#191714',
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 38,
  },
  subtitle: {
    color: '#605a52',
    fontSize: 16,
    lineHeight: 23,
    marginTop: 10,
  },
  toolCard: {
    backgroundColor: '#fffaf2',
    borderColor: '#ded6c8',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
    padding: 16,
  },
  toolInfo: {
    marginBottom: 14,
  },
  toolName: {
    color: '#191714',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0,
  },
  toolDescription: {
    color: '#605a52',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  runButton: {
    alignItems: 'center',
    backgroundColor: '#1f2a1d',
    borderRadius: 6,
    minHeight: 48,
    justifyContent: 'center',
  },
  runButtonDisabled: {
    opacity: 0.62,
  },
  runButtonPressed: {
    transform: [{ scale: 0.99 }],
  },
  runButtonText: {
    color: '#fffaf2',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0,
  },
  error: {
    backgroundColor: '#fff0ed',
    borderColor: '#f0b2a8',
    borderRadius: 8,
    borderWidth: 1,
    color: '#8f2d1f',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
    padding: 12,
  },
  resultsHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  resultsTitle: {
    color: '#191714',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0,
  },
  resultsCount: {
    color: '#605a52',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0,
  },
  resultsList: {
    gap: 10,
    paddingBottom: 32,
  },
  appRow: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e5ded2',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 68,
    padding: 12,
  },
  appInitial: {
    alignItems: 'center',
    backgroundColor: '#e7eedb',
    borderRadius: 8,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  appInitialText: {
    color: '#26351f',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0,
  },
  appDetails: {
    flex: 1,
  },
  appName: {
    color: '#191714',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0,
  },
  packageName: {
    color: '#6d665d',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  emptyState: {
    color: '#70695f',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 16,
    textAlign: 'center',
  },
});
