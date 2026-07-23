import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { InstalledApp } from '../native/AppManager';
import { colors } from '../theme';
import { getInstalledAppsTool, openApplicationTool } from '../tools/registry';
import { GradientButton } from './GradientButton';

// get_installed_apps + tap-to-launch (open_application). Lists launchable apps and
// launches the tapped one. Extracted from App.tsx so it can live on the Tools screen.
export function InstalledAppsCard() {
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [launchingPackage, setLaunchingPackage] = useState<string | null>(null);

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
      setError(toolError instanceof Error ? toolError.message : `Failed to open ${app.name}.`);
    } finally {
      setLaunchingPackage(null);
    }
  }

  return (
    <View>
      <View style={styles.card}>
        <View style={styles.info}>
          <Text style={styles.name}>{getInstalledAppsTool.name}</Text>
          <Text style={styles.description}>{getInstalledAppsTool.description}</Text>
        </View>
        <GradientButton
          label={isLoading ? 'Running...' : 'Run tool'}
          disabled={isLoading}
          onPress={runInstalledAppsTool}
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {status ? <Text style={styles.status}>{status}</Text> : null}

      {apps.length > 0 ? (
        <>
          <View style={styles.resultsHeader}>
            <Text style={styles.resultsTitle}>Installed apps</Text>
            <Text style={styles.resultsCount}>{apps.length}</Text>
          </View>
          <Text style={styles.resultsHint}>Tap an app to launch it with open_application.</Text>
        </>
      ) : null}

      <View style={styles.resultsList}>
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
    padding: 16,
  },
  info: {
    marginBottom: 14,
  },
  name: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  description: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  error: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.dangerText,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
    padding: 12,
  },
  status: {
    backgroundColor: colors.positiveBg,
    borderColor: colors.positiveBorder,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.positive,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
    padding: 12,
  },
  resultsHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  resultsTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  resultsCount: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '700',
  },
  resultsHint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  resultsList: {
    gap: 10,
  },
  appRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 68,
    padding: 12,
  },
  appRowDisabled: {
    opacity: 0.5,
  },
  appRowPressed: {
    backgroundColor: colors.surfaceAlt,
    transform: [{ scale: 0.995 }],
  },
  appAction: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  appInitial: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    borderRadius: 10,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  appInitialText: {
    color: colors.accent,
    fontSize: 17,
    fontWeight: '900',
  },
  appDetails: {
    flex: 1,
  },
  appName: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  packageName: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
});
