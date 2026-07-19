import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { InstalledApp } from './src/native/AppManager';
import { getInstalledAppsTool, openApplicationTool } from './src/tools/registry';

export default function App() {
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [launchingPackage, setLaunchingPackage] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function runInstalledAppsTool() {
    setIsLoading(true);
    setError(null);
    setStatus(null);

    try {
      const result = await getInstalledAppsTool.execute();
      setApps(result);
    } catch (toolError) {
      setError(toolError instanceof Error ? toolError.message : 'Failed to run get_installed_apps.');
    } finally {
      setIsLoading(false);
    }
  }

  async function launchApp(app: InstalledApp) {
    if (launchingPackage) {
      return;
    }

    setLaunchingPackage(app.packageName);
    setError(null);
    setStatus(null);

    try {
      await openApplicationTool.execute({ packageName: app.packageName });
      setStatus(`Launched ${app.name}`);
    } catch (toolError) {
      setError(
        toolError instanceof Error ? toolError.message : `Failed to open ${app.name}.`
      );
    } finally {
      setLaunchingPackage(null);
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
          <Text style={styles.toolName}>{getInstalledAppsTool.name}</Text>
          <Text style={styles.toolDescription}>{getInstalledAppsTool.description}</Text>
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
      {status ? <Text style={styles.status}>{status}</Text> : null}

      <View style={styles.resultsHeader}>
        <Text style={styles.resultsTitle}>Installed apps</Text>
        <Text style={styles.resultsCount}>{apps.length}</Text>
      </View>
      {apps.length > 0 ? (
        <Text style={styles.resultsHint}>Tap an app to launch it with open_application.</Text>
      ) : null}

      <ScrollView contentContainerStyle={styles.resultsList}>
        {apps.map((app) => {
          const isLaunching = launchingPackage === app.packageName;
          const initial = app.name.trim().slice(0, 1).toUpperCase() || '?';

          return (
            <Pressable
              key={app.packageName}
              accessibilityRole="button"
              disabled={!app.launchable || launchingPackage !== null}
              onPress={() => launchApp(app)}
              style={({ pressed }) => [
                styles.appRow,
                !app.launchable && styles.appRowDisabled,
                pressed && app.launchable && launchingPackage === null && styles.appRowPressed,
              ]}
            >
              <View style={styles.appInitial}>
                <Text style={styles.appInitialText}>{initial}</Text>
              </View>
              <View style={styles.appDetails}>
                <Text style={styles.appName}>{app.name}</Text>
                <Text style={styles.packageName}>{app.packageName}</Text>
              </View>
              <Text style={styles.appAction}>
                {isLaunching ? 'Opening...' : app.launchable ? 'Open' : 'No launcher'}
              </Text>
            </Pressable>
          );
        })}
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
  status: {
    backgroundColor: '#eef4e6',
    borderColor: '#c3d4a8',
    borderRadius: 8,
    borderWidth: 1,
    color: '#3c5226',
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
  resultsHint: {
    color: '#70695f',
    fontSize: 13,
    lineHeight: 18,
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
  appRowDisabled: {
    opacity: 0.55,
  },
  appRowPressed: {
    backgroundColor: '#f3efe6',
    transform: [{ scale: 0.995 }],
  },
  appAction: {
    color: '#5f6f52',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
    textTransform: 'uppercase',
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
