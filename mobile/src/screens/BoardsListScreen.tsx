import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientButton } from '../components/GradientButton';
import { BACKEND_BASE_URL } from '../config/backend';
import { getBoardModule } from '../native/Board';
import { createBoard, deleteBoard, listBoards, type BoardSummary } from '../planner/boardClient';
import { colors, touchTarget } from '../theme';

type Props = {
  onBack: () => void;
};

const KIND_LABEL: Record<BoardSummary['kind'], string> = {
  drawing: 'Drawing',
  lesson: 'Lesson',
  choices: 'Choices',
};

function relativeTime(iso: string): string {
  const then = new Date(iso.includes('Z') || iso.includes('+') ? iso : `${iso}Z`).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

// The saved-boards list. Each board opens the full-screen native canvas (BoardActivity via
// native/Board.ts); the canvas autosaves to the backend, so this screen just refreshes when the
// user comes back. See docs plan: Board sessions are stored like Claude Code sessions.
export function BoardsListScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setBoards(await listBoards());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your boards.');
      setBoards([]);
    }
  }, []);

  useEffect(() => {
    void load();
    // The canvas is a separate Activity on top of this one; reload when we return to the foreground
    // so a board just edited shows its fresh thumbnail and ordering.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => subscription.remove();
  }, [load]);

  const openBoard = useCallback(async (id: string, title: string) => {
    try {
      await getBoardModule().openBoard(id, BACKEND_BASE_URL, title);
    } catch (e) {
      Alert.alert('Could not open the board', e instanceof Error ? e.message : 'Try again after installing the latest build.');
    }
  }, []);

  const newBoard = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const created = await createBoard('Untitled board', 'drawing');
      await openBoard(created.id, created.title);
      void load();
    } catch (e) {
      Alert.alert('Could not create a board', e instanceof Error ? e.message : 'Check your connection.');
    } finally {
      setBusy(false);
    }
  }, [busy, openBoard, load]);

  const confirmDelete = useCallback(
    (board: BoardSummary) => {
      Alert.alert(`Delete "${board.title}"?`, 'This removes the board and its history.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteBoard(board.id);
              void load();
            } catch (e) {
              Alert.alert('Could not delete', e instanceof Error ? e.message : 'Try again.');
            }
          },
        },
      ]);
    },
    [load],
  );

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to Home" onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>Boards</Text>
          <Text style={styles.subtitle}>
            {boards === null ? 'Loading…' : `${boards.length} ${boards.length === 1 ? 'session' : 'sessions'}`}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {boards === null ? (
          <ActivityIndicator color={colors.accent} style={styles.loading} />
        ) : boards.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Start your first board</Text>
            <Text style={styles.emptyBody}>
              Draw a sketch and ask the AI about it, or have it explain something on the canvas.
            </Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        ) : (
          <View style={styles.card}>
            {boards.map((board, index) => (
              <Pressable
                key={board.id}
                accessibilityRole="button"
                accessibilityLabel={`Open ${board.title}`}
                onPress={() => void openBoard(board.id, board.title)}
                onLongPress={() => confirmDelete(board)}
                style={({ pressed }) => [styles.row, index > 0 && styles.rowDivider, pressed && styles.pressed]}
              >
                {board.thumb ? (
                  <Image source={{ uri: board.thumb }} style={styles.thumb} />
                ) : (
                  <View style={styles.thumb} />
                )}
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {board.title}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {KIND_LABEL[board.kind]} · {relativeTime(board.updatedAt)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <GradientButton label={busy ? 'Opening…' : 'New board'} onPress={() => void newBoard()} disabled={busy} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    paddingBottom: 8,
    paddingHorizontal: 12,
  },
  backButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: touchTarget,
    minWidth: touchTarget,
    paddingHorizontal: 8,
  },
  backText: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '700',
  },
  headerText: {
    flex: 1,
    marginLeft: 4,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
  },
  loading: {
    marginTop: 40,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 68,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  rowDivider: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  pressed: {
    backgroundColor: colors.surfaceAlt,
  },
  thumb: {
    backgroundColor: colors.codeBg,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    height: 52,
    width: 52,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  rowMeta: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 3,
  },
  empty: {
    marginTop: 48,
    paddingHorizontal: 8,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  emptyBody: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  error: {
    color: colors.dangerText,
    fontSize: 13,
    marginTop: 12,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
});
