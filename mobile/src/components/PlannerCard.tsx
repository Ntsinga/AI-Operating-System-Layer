import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { planToolCall, type PlannedToolCall } from '../planner/openaiPlanner';
import { getInstalledAppsTool, tools } from '../tools/registry';

type Phase = 'idle' | 'planning' | 'proposed' | 'running';

export function PlannerCard() {
  const [command, setCommand] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [proposal, setProposal] = useState<PlannedToolCall | null>(null);
  const [result, setResult] = useState<unknown>(undefined);
  const [error, setError] = useState<string | null>(null);

  async function handlePlan() {
    if (!command.trim()) {
      return;
    }

    setPhase('planning');
    setError(null);
    setProposal(null);
    setResult(undefined);

    try {
      // Ground the planner in the real installed-app list so open_application (and
      // similar tools) get real package names instead of the model guessing from
      // training-data knowledge. Best-effort: if this fails, plan without it.
      const installedApps = await getInstalledAppsTool.execute().catch(() => undefined);
      const planned = await planToolCall(command.trim(), installedApps);
      setProposal(planned);
      setPhase('proposed');
    } catch (planError) {
      setError(planError instanceof Error ? planError.message : 'Failed to plan a tool call.');
      setPhase('idle');
    }
  }

  async function handleConfirm() {
    if (!proposal) {
      return;
    }

    const tool = tools.find((candidate) => candidate.name === proposal.toolName);
    if (!tool) {
      setError(`Model chose an unknown tool: ${proposal.toolName}`);
      return;
    }

    setPhase('running');
    setError(null);

    try {
      const toolResult = await tool.execute(proposal.arguments as never);
      setResult(toolResult);
    } catch (executeError) {
      setError(executeError instanceof Error ? executeError.message : `Failed to run ${tool.name}.`);
    } finally {
      setPhase('idle');
      setProposal(null);
    }
  }

  function handleCancel() {
    setProposal(null);
    setPhase('idle');
  }

  return (
    <View style={styles.card}>
      <View style={styles.info}>
        <Text style={styles.name}>AI planner (Phase 2)</Text>
        <Text style={styles.description}>
          Type a command in plain English. The model picks one tool and its arguments; nothing
          runs until you confirm.
        </Text>
      </View>

      <TextInput
        style={styles.input}
        placeholder="e.g. open Chrome"
        placeholderTextColor="#9a9186"
        value={command}
        onChangeText={setCommand}
        editable={phase === 'idle'}
      />

      <Pressable
        accessibilityRole="button"
        disabled={phase !== 'idle' || !command.trim()}
        onPress={handlePlan}
        style={({ pressed }) => [
          styles.button,
          (phase !== 'idle' || !command.trim()) && styles.buttonDisabled,
          pressed && phase === 'idle' && command.trim() && styles.buttonPressed,
        ]}
      >
        <Text style={styles.buttonText}>{phase === 'planning' ? 'Planning...' : 'Plan'}</Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {proposal ? (
        <View style={styles.proposalBox}>
          <Text style={styles.proposalLabel}>Proposed tool call</Text>
          <Text style={styles.proposalText} selectable>
            {JSON.stringify(proposal, null, 2)}
          </Text>
          <View style={styles.proposalActions}>
            <Pressable
              accessibilityRole="button"
              disabled={phase === 'running'}
              onPress={handleConfirm}
              style={({ pressed }) => [
                styles.confirmButton,
                phase === 'running' && styles.buttonDisabled,
                pressed && phase !== 'running' && styles.buttonPressed,
              ]}
            >
              <Text style={styles.buttonText}>{phase === 'running' ? 'Running...' : 'Confirm & run'}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={phase === 'running'}
              onPress={handleCancel}
              style={({ pressed }) => [
                styles.cancelButton,
                pressed && phase !== 'running' && styles.buttonPressed,
              ]}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {result !== undefined ? (
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
    marginBottom: 16,
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
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#e5ded2',
    borderRadius: 6,
    borderWidth: 1,
    color: '#191714',
    fontSize: 15,
    marginBottom: 12,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#1f2a1d',
    borderRadius: 6,
    justifyContent: 'center',
    minHeight: 44,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPressed: {
    transform: [{ scale: 0.99 }],
  },
  buttonText: {
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
  proposalBox: {
    backgroundColor: '#eef4e6',
    borderColor: '#c3d4a8',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
    padding: 12,
  },
  proposalLabel: {
    color: '#3c5226',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  proposalText: {
    color: '#26351f',
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 12,
  },
  proposalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  confirmButton: {
    alignItems: 'center',
    backgroundColor: '#1f2a1d',
    borderRadius: 6,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
  },
  cancelButton: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderColor: '#8f2d1f',
    borderRadius: 6,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
  },
  cancelButtonText: {
    color: '#8f2d1f',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0,
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
