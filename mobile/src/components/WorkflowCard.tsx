import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  resumeWorkflow,
  startWorkflow,
  type ProposedToolCall,
  type ToolCallRecord,
  type WorkflowResponse,
} from '../planner/workflowClient';
import { colors } from '../theme';
import { getInstalledAppsTool, tools } from '../tools/registry';
import { getBriefStore } from '../native/BriefStore';
import { GradientButton } from './GradientButton';
import { VoiceInputButton } from './VoiceInputButton';

type Phase = 'idle' | 'starting' | 'awaiting_confirmation' | 'awaiting_reply' | 'running' | 'done';

export function WorkflowCard({ initialCommand }: { initialCommand?: string | null }) {
  const [command, setCommand] = useState('');
  const [replyText, setReplyText] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [threadId, setThreadId] = useState<string | null>(null);
  const [proposal, setProposal] = useState<ProposedToolCall | null>(null);
  const [assistantMessage, setAssistantMessage] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<ToolCallRecord[]>([]);
  const [finalMessage, setFinalMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transcribedNotice, setTranscribedNotice] = useState<string | null>(null);

  function handleTranscribed(text: string) {
    setError(null);
    setTranscribedNotice(text.trim() ? `Heard: "${text.trim()}"` : 'Heard nothing - try again.');
    if (text.trim()) {
      setCommand(text);
    }
  }

  function handleVoiceError(message: string) {
    setTranscribedNotice(null);
    setError(message);
  }

  function reset() {
    setPhase('idle');
    setThreadId(null);
    setProposal(null);
    setAssistantMessage(null);
    setCompletedSteps([]);
    setFinalMessage(null);
    setReplyText('');
    setTranscribedNotice(null);
  }

  function applyResponse(response: WorkflowResponse) {
    setThreadId(response.threadId);
    setCompletedSteps(response.history);
    setProposal(null);
    setAssistantMessage(null);

    if (response.status === 'awaiting_confirmation') {
      setProposal(response.proposedTool);
      setPhase('awaiting_confirmation');
    } else if (response.status === 'awaiting_reply') {
      setAssistantMessage(response.message);
      setPhase('awaiting_reply');
    } else {
      setFinalMessage(response.finalMessage);
      setPhase('done');
      if (response.finalMessage?.trim()) void getBriefStore().saveBrief(response.finalMessage.trim()).catch(() => undefined);
    }
  }

  async function handleStart(commandOverride?: string) {
    const requestedCommand = (commandOverride ?? command).trim();
    if (!requestedCommand) {
      return;
    }

    setCommand(requestedCommand);
    reset();
    setPhase('starting');
    setError(null);

    try {
      const installedApps = await getInstalledAppsTool.execute().catch(() => undefined);
      const response = await startWorkflow(requestedCommand, installedApps);
      applyResponse(response);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : 'Failed to start workflow.');
      setPhase('idle');
    }
  }

  useEffect(() => {
    if (initialCommand?.trim()) {
      void handleStart(initialCommand);
    }
  }, [initialCommand]);

  async function handleConfirm() {
    if (!proposal || !threadId) {
      return;
    }

    const tool = tools.find((candidate) => candidate.name === proposal.toolName);
    if (!tool) {
      setError(`Model chose an unknown tool: ${proposal.toolName}`);
      return;
    }

    setPhase('running');
    setError(null);

    let toolResult: unknown;
    try {
      toolResult = await tool.execute(proposal.arguments as never);
    } catch (executeError) {
      // Feed the failure back into the workflow (instead of aborting) so the model
      // can see what went wrong and try a different tool/argument on the next step.
      toolResult = {
        error: executeError instanceof Error ? executeError.message : `Failed to run ${tool.name}.`,
      };
    }

    try {
      const response = await resumeWorkflow(threadId, toolResult);
      applyResponse(response);
    } catch (resumeError) {
      setError(resumeError instanceof Error ? resumeError.message : 'Failed to resume workflow.');
      setPhase('idle');
    }
  }

  async function handleReply() {
    if (!threadId || !replyText.trim()) {
      return;
    }

    setPhase('running');
    setError(null);

    try {
      const response = await resumeWorkflow(threadId, replyText.trim());
      setReplyText('');
      applyResponse(response);
    } catch (resumeError) {
      setError(resumeError instanceof Error ? resumeError.message : 'Failed to send reply.');
      setPhase('awaiting_reply');
    }
  }

  async function handleImageChoice(imageUrl: string) {
    if (!threadId || phase !== 'awaiting_reply') return;
    setPhase('running');
    setError(null);
    try {
      const response = await resumeWorkflow(threadId, `I choose this image: ${imageUrl}`);
      applyResponse(response);
    } catch (choiceError) {
      setError(choiceError instanceof Error ? choiceError.message : 'Failed to choose image.');
      setPhase('awaiting_reply');
    }
  }

  function handleStop() {
    // Local-only: does not notify the backend. The paused checkpoint is simply
    // abandoned (in-memory checkpointer, so it is not a persistent leak).
    reset();
  }

  const isBusy = phase === 'starting' || phase === 'running';
  const imageChoices = [...completedSteps]
    .reverse()
    .find((step) => step.toolName === 'search_images' && Array.isArray(step.result))?.result as
    | Array<{ imageUrl?: string; thumbnailUrl?: string; title?: string }>
    | undefined;

  return (
    <View style={styles.card}>
      <View style={styles.info}>
        <Text style={styles.name}>AI assistant</Text>
        <Text style={styles.description}>
          Type or speak a command in plain English. Runs a chain of tool calls and
          back-and-forth replies until you stop it or 12 steps pass - nothing runs until you
          confirm. Requires the backend (backend/: uvicorn app.main:app) running and reachable.
        </Text>
      </View>

      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, styles.inputWithButton]}
          placeholder="e.g. find me 5 fitness apps, I'll pick one"
          placeholderTextColor={colors.textMuted}
          value={command}
          onChangeText={(text) => {
            setCommand(text);
            setTranscribedNotice(null);
          }}
          editable={phase === 'idle'}
        />
        <VoiceInputButton onTranscribed={handleTranscribed} onError={handleVoiceError} />
      </View>

      {transcribedNotice ? <Text style={styles.transcribedNotice}>{transcribedNotice}</Text> : null}

      <GradientButton
        label={phase === 'starting' ? 'Starting...' : 'Run'}
        disabled={phase !== 'idle' || !command.trim()}
        onPress={handleStart}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {completedSteps.length > 0 ? (
        <View style={styles.stepsBox}>
          <Text style={styles.stepsLabel}>Completed steps</Text>
          {completedSteps.map((step, index) => (
            <Text key={index} style={styles.stepText} selectable>
              {`${index + 1}. ${step.toolName}(${JSON.stringify(step.arguments)}) -> ${JSON.stringify(step.result)}`}
            </Text>
          ))}
        </View>
      ) : null}

      {proposal ? (
        <View style={styles.proposalBox}>
          <Text style={styles.proposalLabel}>Proposed next step</Text>
          <Text style={styles.proposalText} selectable>
            {JSON.stringify(proposal, null, 2)}
          </Text>
          <View style={styles.proposalActions}>
            <GradientButton
              label={phase === 'running' ? 'Running...' : 'Confirm & run'}
              disabled={isBusy}
              onPress={handleConfirm}
              style={styles.flexButton}
            />
            <Pressable
              accessibilityRole="button"
              disabled={isBusy}
              onPress={handleStop}
              style={({ pressed }) => [styles.cancelButton, pressed && !isBusy && styles.buttonPressed]}
            >
              <Text style={styles.cancelButtonText}>Stop</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {assistantMessage ? (
        <View style={styles.replyBox}>
          <Text style={styles.replyLabel}>Assistant</Text>
          <Text style={styles.replyMessage} selectable>
            {assistantMessage}
          </Text>
          {imageChoices?.length ? (
            <View style={styles.imageChoices}>
              {imageChoices.slice(0, 12).map((choice, index) => (
                <Pressable
                  key={`${choice.imageUrl ?? index}`}
                  style={styles.imageChoice}
                  disabled={isBusy || !choice.imageUrl}
                  onPress={() => choice.imageUrl && void handleImageChoice(choice.imageUrl)}
                >
                  <Image source={{ uri: choice.thumbnailUrl || choice.imageUrl }} style={styles.imageChoiceThumb} />
                  <Text style={styles.imageChoiceTitle} numberOfLines={2}>{choice.title || `Image ${index + 1}`}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <TextInput
            style={styles.input}
            placeholder="Type your reply..."
            placeholderTextColor={colors.textMuted}
            value={replyText}
            onChangeText={setReplyText}
            editable={phase === 'awaiting_reply'}
          />
          <View style={styles.proposalActions}>
            <GradientButton
              label={phase === 'running' ? 'Sending...' : 'Send'}
              disabled={isBusy || !replyText.trim()}
              onPress={handleReply}
              style={styles.flexButton}
            />
            <Pressable
              accessibilityRole="button"
              disabled={isBusy}
              onPress={handleStop}
              style={({ pressed }) => [styles.cancelButton, pressed && !isBusy && styles.buttonPressed]}
            >
              <Text style={styles.cancelButtonText}>Done</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {phase === 'done' && finalMessage ? (
        <View style={styles.resultBox}>
          <Text style={styles.resultLabel}>Workflow finished</Text>
          <Text style={styles.resultText} selectable>
            {finalMessage}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    paddingTop: 4,
  },
  info: {
    marginBottom: 14,
  },
  name: {
    color: colors.textPrimary,
    fontSize: 18,
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
    marginBottom: 12,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  inputRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
  },
  inputWithButton: {
    flex: 1,
  },
  transcribedNotice: {
    color: colors.accent,
    fontSize: 13,
    fontStyle: 'italic',
    marginBottom: 12,
    marginTop: -6,
  },
  buttonPressed: {
    transform: [{ scale: 0.99 }],
  },
  flexButton: {
    flex: 1,
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
  stepsBox: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 12,
    padding: 10,
  },
  stepsLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  stepText: {
    color: colors.textSecondary,
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  proposalBox: {
    backgroundColor: colors.positiveBg,
    borderColor: colors.positiveBorder,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 12,
    padding: 12,
  },
  proposalLabel: {
    color: colors.positive,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  proposalText: {
    color: colors.textPrimary,
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 12,
  },
  proposalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelButton: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderColor: colors.danger,
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  cancelButtonText: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0,
  },
  replyBox: {
    backgroundColor: colors.infoBg,
    borderColor: colors.infoBorder,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 12,
    padding: 12,
  },
  replyLabel: {
    color: colors.info,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  replyMessage: {
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  imageChoices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  imageChoice: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    width: '31%',
  },
  imageChoiceThumb: {
    backgroundColor: colors.codeBg,
    height: 86,
    width: '100%',
  },
  imageChoiceTitle: {
    color: colors.textSecondary,
    fontSize: 10,
    lineHeight: 13,
    padding: 5,
  },
  resultBox: {
    backgroundColor: colors.codeBg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    marginTop: 12,
    padding: 10,
  },
  resultLabel: {
    color: colors.positive,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  resultText: {
    color: colors.textPrimary,
    fontSize: 13,
    lineHeight: 19,
  },
});
