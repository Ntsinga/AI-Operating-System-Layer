import { ScrollView, StyleSheet } from 'react-native';

import { WorkflowCard } from '../components/WorkflowCard';

// The "Chat" tab: the conversational AI assistant (type/speak a command, confirm
// tool calls, reply back and forth). WorkflowCard holds all of that logic.
export function ChatScreen({ voiceCommand }: { voiceCommand?: string | null }) {
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
    >
      <WorkflowCard initialCommand={voiceCommand} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingBottom: 24,
  },
});
