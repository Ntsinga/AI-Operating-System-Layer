import { ScrollView, StyleSheet } from 'react-native';

import { WorkflowCard } from '../components/WorkflowCard';
import { ActivationSetupCard } from '../components/ActivationSetupCard';

type ChatScreenProps = {
  voiceCommand?: string | null;
  onVoiceCommandConsumed?: () => void;
  liveVoiceRequested?: boolean;
  onLiveVoiceRequestConsumed?: () => void;
};

// The "Chat" tab: the conversational AI assistant (type/speak/talk live to a command,
// confirm tool calls, reply back and forth). WorkflowCard holds all of that logic.
export function ChatScreen({
  voiceCommand,
  onVoiceCommandConsumed,
  liveVoiceRequested,
  onLiveVoiceRequestConsumed,
}: ChatScreenProps) {
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
    >
      <ActivationSetupCard />
      <WorkflowCard
        initialCommand={voiceCommand}
        onInitialCommandConsumed={onVoiceCommandConsumed}
        liveVoiceRequested={liveVoiceRequested}
        onLiveVoiceRequestConsumed={onLiveVoiceRequestConsumed}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingBottom: 24,
  },
});
