import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme';
import type { ToolDefinition } from '../tools/types';
import { GradientButton } from './GradientButton';

type JsonToolCardProps = {
  tool: ToolDefinition<void, unknown>;
};

export function JsonToolCard({ tool }: JsonToolCardProps) {
  const [result, setResult] = useState<unknown>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function run() {
    setIsLoading(true);
    setError(null);

    try {
      const toolResult = await tool.execute();
      setResult(toolResult);
    } catch (toolError) {
      setError(toolError instanceof Error ? toolError.message : `Failed to run ${tool.name}.`);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.info}>
        <Text style={styles.name}>{tool.name}</Text>
        <Text style={styles.description}>{tool.description}</Text>
      </View>
      <GradientButton
        label={isLoading ? 'Running...' : 'Run tool'}
        disabled={isLoading}
        onPress={run}
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
    marginBottom: 12,
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
