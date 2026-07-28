import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors } from '../theme';
import type { ToolDefinition } from '../tools/types';
import { getAppManager, type InstalledApp } from '../native/AppManager';
import { GradientButton } from './GradientButton';

type Field = {
  key: string;
  label: string;
  placeholder?: string;
  numeric?: boolean;
  appPicker?: boolean;
};

type InputToolCardProps = {
  tool: ToolDefinition<any, unknown>;
  fields: Field[];
};

export function InputToolCard({ tool, fields }: InputToolCardProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [appQueries, setAppQueries] = useState<Record<string, string>>({});
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [appsError, setAppsError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const needsApps = fields.some((field) => field.appPicker);

  useEffect(() => {
    if (!needsApps) return;
    let cancelled = false;
    getAppManager()
      .getInstalledApps()
      .then((installed) => {
        if (!cancelled) setApps(installed.filter((app) => app.launchable));
      })
      .catch((err) => {
        if (!cancelled) setAppsError(err instanceof Error ? err.message : 'Could not load apps.');
      });
    return () => { cancelled = true; };
  }, [needsApps]);

  function setField(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function selectApp(field: Field, app: InstalledApp) {
    setField(field.key, app.packageName);
    setAppQueries((prev) => ({ ...prev, [field.key]: app.name }));
  }

  function appMatches(field: Field) {
    const query = (appQueries[field.key] ?? '').trim().toLowerCase();
    if (!query) return apps.slice(0, 6);
    return apps
      .filter((app) => `${app.name} ${app.packageName}`.toLowerCase().includes(query))
      .slice(0, 6);
  }

  async function run() {
    setIsLoading(true);
    setError(null);

    try {
      const input: Record<string, unknown> = {};
      for (const field of fields) {
        const raw = values[field.key] ?? '';
        input[field.key] = field.numeric ? Number(raw) : raw;
      }

      const toolResult = await tool.execute(input as never);
      setResult(toolResult);
    } catch (toolError) {
      setError(toolError instanceof Error ? toolError.message : `Failed to run ${tool.name}.`);
    } finally {
      setIsLoading(false);
    }
  }

  const canRun = fields.every((field) => (values[field.key] ?? '').trim().length > 0);

  return (
    <View style={styles.card}>
      <View style={styles.info}>
        <Text style={styles.name}>{tool.name}</Text>
        <Text style={styles.description}>{tool.description}</Text>
      </View>

      {fields.map((field) => field.appPicker ? (
        <View key={field.key} style={styles.appPicker}>
          <TextInput
            style={styles.input}
            placeholder={field.placeholder ?? field.label}
            placeholderTextColor={colors.textMuted}
            value={appQueries[field.key] ?? ''}
            onChangeText={(text) => {
              setAppQueries((prev) => ({ ...prev, [field.key]: text }));
              setField(field.key, '');
            }}
            editable={!isLoading}
          />
          {values[field.key] ? <Text style={styles.selectedApp}>Selected app ready</Text> : null}
          {appsError ? <Text style={styles.errorInline}>{appsError}</Text> : null}
          {!values[field.key] ? appMatches(field).map((app) => (
            <Pressable key={app.packageName} style={styles.appRow} onPress={() => selectApp(field, app)} disabled={isLoading}>
              <Text style={styles.appName}>{app.name}</Text>
            </Pressable>
          )) : null}
        </View>
      ) : (
        <TextInput
          key={field.key}
          style={styles.input}
          placeholder={field.placeholder ?? field.label}
          placeholderTextColor={colors.textMuted}
          value={values[field.key] ?? ''}
          onChangeText={(text) => setField(field.key, text)}
          keyboardType={field.numeric ? 'numeric' : 'default'}
          editable={!isLoading}
        />
      ))}

      <GradientButton
        label={isLoading ? 'Running...' : 'Run tool'}
        disabled={isLoading || !canRun}
        onPress={run}
        style={styles.runButton}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {result !== undefined && !error ? (
        <View style={styles.resultBox}>
          <Text style={styles.resultText} selectable>
            {JSON.stringify(result, null, 2)}
          </Text>
        </View>
      ) : null}
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
    letterSpacing: 0,
  },
  description: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.textPrimary,
    fontSize: 15,
    marginBottom: 10,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  appPicker: {
    marginBottom: 2,
  },
  appRow: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  appName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  selectedApp: {
    color: colors.positive,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  errorInline: {
    color: colors.dangerText,
    fontSize: 12,
    marginBottom: 8,
  },
  runButton: {
    marginTop: 2,
  },
  error: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.dangerText,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 12,
    padding: 10,
  },
  resultBox: {
    backgroundColor: colors.codeBg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    marginTop: 12,
    padding: 10,
  },
  resultText: {
    color: colors.textSecondary,
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 17,
  },
});
