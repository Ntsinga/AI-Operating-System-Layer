import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ToolDefinition } from '../tools/types';

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
      <Pressable
        accessibilityRole="button"
        disabled={isLoading}
        onPress={run}
        style={({ pressed }) => [
          styles.runButton,
          isLoading && styles.runButtonDisabled,
          pressed && !isLoading && styles.runButtonPressed,
        ]}
      >
        <Text style={styles.runButtonText}>{isLoading ? 'Running...' : 'Run tool'}</Text>
      </Pressable>
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
    backgroundColor: '#fffaf2',
    borderColor: '#ded6c8',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
    padding: 16,
  },
  info: {
    marginBottom: 14,
  },
  name: {
    color: '#191714',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0,
  },
  description: {
    color: '#605a52',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  runButton: {
    alignItems: 'center',
    backgroundColor: '#1f2a1d',
    borderRadius: 6,
    minHeight: 44,
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
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0,
  },
  error: {
    backgroundColor: '#fff0ed',
    borderColor: '#f0b2a8',
    borderRadius: 8,
    borderWidth: 1,
    color: '#8f2d1f',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 12,
    padding: 10,
  },
  resultBox: {
    backgroundColor: '#191714',
    borderRadius: 6,
    marginTop: 12,
    padding: 10,
  },
  resultText: {
    color: '#eef4e6',
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 17,
  },
});
