import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  resumeWorkflow,
  completeWorkflow,
  startWorkflow,
  type ProposedToolCall,
  type ToolCallRecord,
  type WorkflowResponse,
} from '../planner/workflowClient';
import { brandGradient, colors, gradientEnd, gradientStart } from '../theme';
import { getInstalledAppsTool, tools } from '../tools/registry';
import { getBriefStore } from '../native/BriefStore';
import type { ProposedToolEvent } from '../native/LiveVoice';
import { GradientButton } from './GradientButton';
import { SendIcon } from './HomeIcons';
import { LiveVoiceButton } from './LiveVoiceButton';

type Phase = 'idle' | 'starting' | 'awaiting_confirmation' | 'awaiting_reply' | 'running' | 'done';

type WorkflowCardProps = {
  initialCommand?: string | null;
  onInitialCommandConsumed?: () => void;
  // Set by App.tsx's aios://voice?live=1 deep link (VoiceActivationService.kt, after
  // "Hey Casper") - auto-starts LiveVoiceButton's session instead of dropping text into
  // the command box, mirroring initialCommand's auto-start for typed/one-shot commands.
  liveVoiceRequested?: boolean;
  onLiveVoiceRequestConsumed?: () => void;
  // Mirrors the composer's thumb-side buttons (mic, send) to the left - see HandednessCard.tsx.
  leftHanded?: boolean;
  // Bumped by the Home ask bar to bring the composer's keyboard up.
  focusToken?: number;
};

// The chat surface inside ChatSheet: results scroll above, and the composer is docked at the
// bottom (same spot as the Home ask bar) so a one-handed thumb reaches it.
export function WorkflowCard({
  initialCommand,
  onInitialCommandConsumed,
  liveVoiceRequested,
  onLiveVoiceRequestConsumed,
  leftHanded = false,
  focusToken,
}: WorkflowCardProps) {
  const [command, setCommand] = useState('');
  const [dockedText, setDockedText] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [threadId, setThreadId] = useState<string | null>(null);
  const [proposal, setProposal] = useState<ProposedToolCall | null>(null);
  const [assistantMessage, setAssistantMessage] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<ToolCallRecord[]>([]);
  const [finalMessage, setFinalMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reusedProcedureCount, setReusedProcedureCount] = useState(0);
  const lastAutoStartedCommand = useRef<string | null>(null);
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();

  function handleVoiceError(message: string) {
    setReusedProcedureCount(0);
    setError(message);
  }

  // A GPT-Live-1 session proposed a tool (backend/app/live_voice.py's "proposed_tool"
  // control frame, relayed by LiveVoiceButton). Feed it through the exact same
  // confirm-card / auto-execute policy a typed command's startWorkflow() response
  // already goes through below - live voice and text share one policy, not two.
  function handleLiveProposedTool(event: ProposedToolEvent) {
    setError(null);
    setCommand('');
    applyResponse({
      threadId: event.threadId,
      status: 'awaiting_confirmation',
      proposedTool: event.proposedTool,
      history: completedSteps,
      reusedProcedureCount,
    });
  }

  function reset() {
    setPhase('idle');
    setThreadId(null);
    setProposal(null);
    setAssistantMessage(null);
    setCompletedSteps([]);
    setFinalMessage(null);
  }

  function applyResponse(response: WorkflowResponse) {
    setThreadId(response.threadId);
    setCompletedSteps(response.history);
    setReusedProcedureCount(response.reusedProcedureCount ?? 0);
    setProposal(null);
    setAssistantMessage(null);

    if (response.status === 'awaiting_confirmation') {
      const tool = tools.find((candidate) => candidate.name === response.proposedTool.toolName);
      setProposal(response.proposedTool);
      if (tool?.confirmBeforeExecute) {
        // Calls, messages, wallpaper changes, settings changes, etc. (see
        // tools/types.ts:confirmBeforeExecute) require an explicit tap before they run - this
        // is the real confirmation gate the backend harness prompt already claims exists.
        setPhase('awaiting_confirmation');
      } else {
        // Everything else auto-executes immediately so a voice command doesn't stop at a
        // redundant "Confirm & run" tap.
        setPhase('running');
        void executeProposal(response.proposedTool, response.threadId);
      }
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
    const normalized = initialCommand?.trim();
    if (!normalized) {
      // Cleared by the parent once consumed: forget it, so the same command (for example the
      // same suggestion chip) can be run again later.
      lastAutoStartedCommand.current = null;
      return;
    }
    if (normalized !== lastAutoStartedCommand.current) {
      lastAutoStartedCommand.current = normalized;
      onInitialCommandConsumed?.();
      void handleStart(normalized);
    }
  }, [initialCommand, onInitialCommandConsumed]);

  // Raised by the Home ask bar: bring the docked composer's keyboard up.
  useEffect(() => {
    if (focusToken) inputRef.current?.focus();
  }, [focusToken]);

  async function executeProposal(proposalToRun: ProposedToolCall, workflowThreadId: string) {
    if (!proposalToRun || !workflowThreadId) {
      return;
    }

    const tool = tools.find((candidate) => candidate.name === proposalToRun.toolName);
    if (!tool) {
      setError(`Model chose an unknown tool: ${proposalToRun.toolName}`);
      return;
    }

    setPhase('running');
    setError(null);

    let toolResult: unknown;
    try {
      toolResult = await tool.execute(proposalToRun.arguments as never);
    } catch (executeError) {
      // Feed the failure back into the workflow (instead of aborting) so the model
      // can see what went wrong and try a different tool/argument on the next step.
      toolResult = {
        error: executeError instanceof Error ? executeError.message : `Failed to run ${tool.name}.`,
      };
    }

    try {
      const response = await resumeWorkflow(workflowThreadId, toolResult);
      applyResponse(response);
    } catch (resumeError) {
      setError(resumeError instanceof Error ? resumeError.message : 'Failed to resume workflow.');
      setPhase('idle');
    }
  }

  // The docked composer serves both moments: a new command when idle (or after a finished run),
  // and the answer to the assistant's question when it is waiting for a reply.
  async function handleDockedSubmit() {
    const text = dockedText.trim();
    if (!text || isBusy || phase === 'awaiting_confirmation') return;
    setDockedText('');

    if (phase === 'awaiting_reply' && threadId) {
      setPhase('running');
      setError(null);
      try {
        applyResponse(await resumeWorkflow(threadId, text));
      } catch (resumeError) {
        setError(resumeError instanceof Error ? resumeError.message : 'Failed to send reply.');
        setPhase('awaiting_reply');
      }
      return;
    }

    if (phase === 'idle' || phase === 'done') await handleStart(text);
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

  async function handleConfirm() {
    if (!proposal || !threadId || phase !== 'awaiting_confirmation') return;
    void executeProposal(proposal, threadId);
  }

  async function handleStop() {
    if (threadId && (phase === 'awaiting_reply' || phase === 'awaiting_confirmation')) {
      try {
        await completeWorkflow(threadId, phase === 'awaiting_confirmation' ? 'cancelled' : 'succeeded');
      } catch {
        // The local workflow can still be stopped if the backend is unavailable.
      }
    }
    reset();
  }

  const isBusy = phase === 'starting' || phase === 'running';
  const imageChoices = [...completedSteps]
    .reverse()
    .find((step) => step.toolName === 'search_images' && Array.isArray(step.result))?.result as
    | Array<{ imageUrl?: string; thumbnailUrl?: string; title?: string }>
    | undefined;

  const results = (
    <>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {reusedProcedureCount > 0 ? (
        <Text style={styles.memoryNotice}>
          Reusing {reusedProcedureCount} learned procedure{reusedProcedureCount === 1 ? '' : 's'}; current state will be verified.
        </Text>
      ) : null}

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
          <Text style={styles.proposalLabel}>{phase === 'awaiting_confirmation' ? 'Confirm this action' : 'Proposed next step'}</Text>
          <Text style={styles.proposalText} selectable>
            {JSON.stringify(proposal, null, 2)}
          </Text>
          <View style={styles.proposalActions}>
            {phase === 'awaiting_confirmation' ? (
              <>
                <GradientButton label="Confirm & run" onPress={() => void handleConfirm()} style={styles.flexButton} />
                <Pressable
                  accessibilityRole="button"
                  onPress={handleStop}
                  style={({ pressed }) => [styles.cancelButton, pressed && styles.buttonPressed]}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.autoRunNotice}>{isBusy ? 'Executing automatically...' : 'Executed'}</Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={isBusy}
                  onPress={handleStop}
                  style={({ pressed }) => [styles.cancelButton, pressed && !isBusy && styles.buttonPressed]}
                >
                  <Text style={styles.cancelButtonText}>Stop</Text>
                </Pressable>
              </>
            )}
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
          <View style={styles.proposalActions}>
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
    </>
  );

  const canSubmit = !isBusy && phase !== 'awaiting_confirmation' && dockedText.trim().length > 0;

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.thread}
        contentContainerStyle={styles.threadContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {command && (phase !== 'idle' || error) ? (
          <View style={styles.userBubble}>
            <Text style={styles.userBubbleText}>{command}</Text>
          </View>
        ) : phase === 'idle' && !error ? (
          <Text style={styles.emptyHint}>Ask for something, or tap the mic to talk.</Text>
        ) : null}
        {results}
      </ScrollView>

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={[styles.composerBar, leftHanded && styles.composerBarLeft]}>
          <TextInput
            ref={inputRef}
            style={styles.composerInput}
            placeholder={phase === 'awaiting_reply' ? 'Type your reply...' : 'Ask or say anything'}
            placeholderTextColor={colors.textMuted}
            value={dockedText}
            onChangeText={setDockedText}
            editable={!isBusy && phase !== 'awaiting_confirmation'}
            returnKeyType="send"
            submitBehavior="submit"
            onSubmitEditing={() => void handleDockedSubmit()}
          />
          <LiveVoiceButton
            compact
            bubbleAlign={leftHanded ? 'left' : 'right'}
            onProposedTool={handleLiveProposedTool}
            onError={handleVoiceError}
            autoStart={liveVoiceRequested}
            onAutoStartConsumed={onLiveVoiceRequestConsumed}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            disabled={!canSubmit}
            onPress={() => void handleDockedSubmit()}
          >
            {canSubmit ? (
              <LinearGradient colors={brandGradient} start={gradientStart} end={gradientEnd} style={styles.sendCircle}>
                <SendIcon color={colors.onAccent} size={18} />
              </LinearGradient>
            ) : (
              <View style={[styles.sendCircle, styles.sendCircleDisabled]}>
                <SendIcon color={colors.textMuted} size={18} />
              </View>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  thread: {
    flex: 1,
  },
  threadContent: {
    flexGrow: 1,
    paddingBottom: 12,
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: colors.infoBg,
    borderBottomRightRadius: 4,
    borderColor: colors.infoBorder,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    maxWidth: '85%',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubbleText: {
    color: colors.info,
    fontSize: 15,
    lineHeight: 21,
  },
  emptyHint: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
  },
  composer: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  composerBar: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderRadius: 30,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    padding: 4,
  },
  composerBarLeft: {
    flexDirection: 'row-reverse',
  },
  composerInput: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  sendCircle: {
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  sendCircleDisabled: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
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
  memoryNotice: {
    color: colors.accent,
    fontSize: 12,
    marginTop: 8,
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
  autoRunNotice: {
    alignItems: 'center',
    color: colors.positive,
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    paddingVertical: 15,
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
