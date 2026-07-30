import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import { api, Todo } from '../services/api';
import { Pressable } from '../components/Pressable';
import { Icon } from '../components/Icon';
import { TodoEditor } from '../components/TodoEditor';
import { bucketOf, formatDue, Bucket } from '../services/todoDates';
import * as haptics from '../services/haptics';
import { colors, spacing, font, radius, gradients, shadow, themed } from '../constants/theme';

const PRIORITY_COLOR: Record<string, string> = {
  high: colors.danger,
  medium: colors.warning,
  low: colors.textTertiary,
};

/** Rendered in this order. "Someday" last on purpose — undated items are the
 *  ones you're least committed to, and burying them keeps the top honest. */
const SECTIONS: { key: Bucket; label: string }[] = [
  { key: 'overdue', label: 'OVERDUE' },
  { key: 'today', label: 'TODAY' },
  { key: 'upcoming', label: 'UPCOMING' },
  { key: 'someday', label: 'SOMEDAY' },
];

function TodoRow({ todo, onToggle, onEdit, onOpenReel, onDelete }: {
  todo: Todo;
  onToggle: () => void;
  onEdit: () => void;
  onOpenReel: () => void;
  onDelete: () => void;
}) {
  const overdue = bucketOf(todo.due_date) === 'overdue' && !todo.completed;
  return (
    <View style={styles.row}>
      <Pressable onPress={onToggle} scaleTo={0.85} hitSlop={8} style={styles.check}>
        <View style={[styles.checkBox, todo.completed && styles.checkBoxOn]}>
          {todo.completed && <Icon name="checkmark" size={13} color="#FFF" />}
        </View>
      </Pressable>

      <Pressable style={styles.rowBody} onPress={onEdit} scaleTo={0.99}>
        <Text style={[styles.rowTitle, todo.completed && styles.rowTitleDone]} numberOfLines={2}>
          {todo.title}
        </Text>
        {!!todo.description && !todo.completed && (
          <Text style={styles.rowDesc} numberOfLines={2}>{todo.description}</Text>
        )}
        <View style={styles.metaRow}>
          <View style={[styles.dot, { backgroundColor: PRIORITY_COLOR[todo.priority] }]} />
          <Text style={[styles.meta, overdue && styles.metaOverdue]}>{formatDue(todo.due_date)}</Text>
          {todo.reel_id && (
            <Pressable onPress={onOpenReel} scaleTo={0.94} hitSlop={6} style={styles.sourceChip}>
              <Icon name="play" size={9} color={colors.accentLight} />
              <Text style={styles.sourceText}>View save</Text>
            </Pressable>
          )}
        </View>
      </Pressable>

      <Pressable onPress={onDelete} scaleTo={0.85} hitSlop={8} style={styles.del}>
        <Icon name="trash" size={15} color={colors.textTertiary} />
      </Pressable>
    </View>
  );
}

export default function TodosScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Todo | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const d = await api.listTodos();
      setTodos(d.items);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Couldn't load your list.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggle = async (todo: Todo) => {
    const next = !todo.completed;
    // Optimistic, and the item STAYS in place while checked — tapping again is
    // the undo. It drops off the list on the next load, which is the natural
    // moment for it to disappear.
    setTodos(ts => ts.map(t => (t.id === todo.id ? { ...t, completed: next } : t)));
    next ? haptics.success() : haptics.tap();
    try {
      await api.updateTodo(todo.id, { completed: next });
    } catch (e: any) {
      setTodos(ts => ts.map(t => (t.id === todo.id ? { ...t, completed: !next } : t)));
      setError(e?.message || "Couldn't update that.");
    }
  };

  const remove = async (todo: Todo) => {
    const before = todos;
    setTodos(ts => ts.filter(t => t.id !== todo.id));
    haptics.warning();
    try {
      await api.deleteTodo(todo.id);
    } catch (e: any) {
      setTodos(before);
      setError(e?.message || "Couldn't delete that.");
    }
  };

  const onSaved = (saved: Todo) => {
    setTodos(ts => {
      const without = ts.filter(t => t.id !== saved.id);
      return [...without, saved];
    });
    // Re-fetch so server-side ordering (date → priority) is authoritative.
    load();
  };

  const openNew = () => { setEditing(null); setEditorOpen(true); };
  const openEdit = (t: Todo) => { setEditing(t); setEditorOpen(true); };

  const grouped = SECTIONS
    .map(s => ({ ...s, items: todos.filter(t => bucketOf(t.due_date) === s.key) }))
    .filter(s => s.items.length > 0);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.accent} size="large" /></View>;
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 92 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={colors.accent}
            colors={[colors.accent]}
            progressBackgroundColor={colors.card}
            title="Refreshing…"
            titleColor={colors.textSecondary}
          />
        }
      >
        {error && (
          <Pressable style={styles.errorBanner} onPress={() => load()} scaleTo={0.99}>
            <Icon name="alert-circle" size={14} color={colors.danger} />
            <Text style={styles.errorText}>{error} Tap to retry.</Text>
          </Pressable>
        )}

        {todos.length === 0 && !error ? (
          <View style={styles.empty}>
            <Icon name="checkbox" size={44} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>Nothing on your list</Text>
            <Text style={styles.emptyText}>
              Add something you want to get done — or open a save and tap “Add to to-do” to
              turn it into a real plan.
            </Text>
          </View>
        ) : (
          grouped.map((section, i) => (
            <MotiView
              key={section.key}
              from={{ opacity: 0, translateY: 8 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: 260, delay: 60 * i }}
              style={styles.section}
            >
              <View style={styles.sectionHead}>
                <Text style={[styles.sectionLabel, section.key === 'overdue' && styles.sectionLabelWarn]}>
                  {section.label}
                </Text>
                <Text style={styles.sectionCount}>{section.items.length}</Text>
              </View>
              {section.items.map(t => (
                <TodoRow
                  key={t.id}
                  todo={t}
                  onToggle={() => toggle(t)}
                  onEdit={() => openEdit(t)}
                  onOpenReel={() => router.push(`/reel/${t.reel_id}`)}
                  onDelete={() => remove(t)}
                />
              ))}
            </MotiView>
          ))
        )}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.sm }]}>
        <Pressable style={styles.addWrap} onPress={openNew} scaleTo={0.97}>
          <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.addBtn}>
            <Icon name="add" size={18} color="#FFF" />
            <Text style={styles.addText}>New to-do</Text>
          </LinearGradient>
        </Pressable>
      </View>

      <TodoEditor
        visible={editorOpen}
        editing={editing}
        onClose={() => { setEditorOpen(false); setEditing(null); }}
        onSaved={onSaved}
      />
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg, flexGrow: 1 },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.danger + '18', borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.danger + '40', padding: spacing.sm,
  },
  errorText: { flex: 1, color: colors.danger, fontSize: font.xs },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg },
  emptyTitle: { color: colors.textPrimary, fontSize: font.lg, fontWeight: '800', marginTop: spacing.sm },
  emptyText: { color: colors.textSecondary, fontSize: font.sm, lineHeight: 21, textAlign: 'center' },

  section: { gap: spacing.sm },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionLabel: { color: colors.textTertiary, fontSize: font.xs, fontWeight: '800', letterSpacing: 1.2 },
  sectionLabelWarn: { color: colors.danger },
  sectionCount: { color: colors.textTertiary, fontSize: font.xs, fontWeight: '700' },

  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: spacing.sm + 4,
  },
  check: { paddingTop: 1 },
  checkBox: {
    width: 21, height: 21, borderRadius: radius.full,
    borderWidth: 1.5, borderColor: colors.borderLight,
    alignItems: 'center', justifyContent: 'center',
  },
  checkBoxOn: { backgroundColor: colors.accent, borderColor: colors.accent },

  rowBody: { flex: 1, gap: 3 },
  rowTitle: { color: colors.textPrimary, fontSize: font.md, fontWeight: '600', lineHeight: 21 },
  rowTitleDone: { color: colors.textTertiary, textDecorationLine: 'line-through' },
  rowDesc: { color: colors.textSecondary, fontSize: font.xs, lineHeight: 17 },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  meta: { color: colors.textTertiary, fontSize: font.xs },
  metaOverdue: { color: colors.danger, fontWeight: '700' },

  sourceChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: colors.accent + '18', borderRadius: radius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 2, marginLeft: spacing.xs,
  },
  sourceText: { color: colors.accentLight, fontSize: 10, fontWeight: '700' },

  del: { paddingTop: 2 },

  bottomBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm,
    backgroundColor: colors.background,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  addWrap: { borderRadius: radius.md, ...shadow.glow },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    borderRadius: radius.md, height: 50,
  },
  addText: { color: '#FFF', fontSize: font.md, fontWeight: '800' },
}));
