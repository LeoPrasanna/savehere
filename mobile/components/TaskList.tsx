import { View, Text, StyleSheet, ActivityIndicator, Animated, TextInput, Platform, Alert } from 'react-native';
import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from './Icon';
import { Task, api } from '../services/api';
import { Pressable } from './Pressable';
import { colors, spacing, font, radius, gradients, themed } from '../constants/theme';

interface Props {
  tasks: Task[];
  reelId: string;
  onUpdate: (updated: Task) => void;
  /** `replaces` is the temporary id handed over by the optimistic add, if that
   *  path ran — swap the draft row for the server's rather than appending a
   *  duplicate. Same convention as TodoEditor's `onOptimistic`. */
  onAdd: (created: Task, replaces?: string) => void;
  onDelete: (id: string) => void;
  kind?: 'steps' | 'tasks';
}

// Module-level: they close over nothing, so keeping them out of the component
// means the handlers below can be useCallback'd without listing them as deps.
const confirmDialog = (msg: string): Promise<boolean> =>
  new Promise(resolve => {
    if (Platform.OS === 'web') return resolve(window.confirm(msg));
    Alert.alert('', msg, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });

const notify = (msg: string) => {
  if (Platform.OS === 'web') window.alert(msg);
  else Alert.alert('', msg);
};

interface RowProps {
  task: Task;
  index: number;
  isSteps: boolean;
  noun: string;
  editing: boolean;
  /** Empty string unless THIS row is being edited — otherwise every keystroke
   *  would change every row's props and defeat the memo. */
  editText: string;
  savingEdit: boolean;
  removing: boolean;
  onToggle: (task: Task) => void;
  onStartEdit: (task: Task) => void;
  onSaveEdit: (task: Task, text: string) => void;
  onCancelEdit: () => void;
  onChangeEditText: (text: string) => void;
  onDelete: (task: Task) => void;
}

/**
 * Memoized row. Was an inline `.map` body with `onPress={() => handleToggle(task)}`
 * per row, so ticking one checkbox reconciled every row in the list. The handlers
 * take the task instead of closing over it, which lets the parent pass one stable
 * reference to all rows.
 */
const TaskRow = memo(function TaskRow({
  task, index, isSteps, noun, editing, editText, savingEdit, removing,
  onToggle, onStartEdit, onSaveEdit, onCancelEdit, onChangeEditText, onDelete,
}: RowProps) {
  return (
    <View style={[styles.row, task.completed && !editing && styles.rowDone]}>
      <Pressable
        style={[styles.check, isSteps && !task.completed && styles.checkStep, task.completed && styles.checkDone]}
        onPress={() => onToggle(task)}
        scaleTo={0.9}
        disabled={editing}
      >
        {task.completed
          ? <Icon name="checkmark" size={15} color={colors.onAction} />
          : isSteps
            ? <Text style={styles.stepNum}>{index + 1}</Text>
            : null}
      </Pressable>

      <Icon name={task.emoji} size={18} color={colors.accentLight} />

      {editing ? (
        <TextInput
          style={styles.editInput}
          value={editText}
          onChangeText={onChangeEditText}
          autoFocus
          multiline
          placeholder={`Edit ${noun}…`}
          placeholderTextColor={colors.textSecondary}
          /* Same dead-handler bug as app/ask.tsx — a multiline input needs
             `submitBehavior` or the return key just adds a newline and this
             never runs. Editing a task had no keyboard confirm at all. */
          onSubmitEditing={() => onSaveEdit(task, editText)}
          submitBehavior="blurAndSubmit"
        />
      ) : (
        <Pressable style={styles.taskText} onPress={() => onToggle(task)} scaleTo={0.99}>
          <Text style={[styles.text, task.completed && styles.textDone]} numberOfLines={4}>
            {task.text}
          </Text>
          {task.estimated_minutes ? (
            <View style={styles.timeRow}>
              <Icon name="time-outline" size={11} color={colors.textTertiary} />
              <Text style={styles.time}>~{task.estimated_minutes} min</Text>
            </View>
          ) : null}
        </Pressable>
      )}

      <View style={styles.rowActions}>
        {editing ? (
          <>
            <Pressable style={styles.iconBtn} onPress={() => onSaveEdit(task, editText)} hitSlop={6} scaleTo={0.85} disabled={savingEdit}>
              {savingEdit ? <ActivityIndicator size="small" color={colors.success} /> : <Icon name="checkmark" size={16} color={colors.success} />}
            </Pressable>
            <Pressable style={styles.iconBtn} onPress={onCancelEdit} hitSlop={6} scaleTo={0.85}>
              <Icon name="close" size={16} color={colors.textTertiary} />
            </Pressable>
          </>
        ) : (
          <>
            <Pressable style={styles.iconBtn} onPress={() => onStartEdit(task)} hitSlop={6} scaleTo={0.85}>
              <Icon name="create" size={15} color={colors.textTertiary} />
            </Pressable>
            <Pressable style={styles.iconBtn} onPress={() => onDelete(task)} hitSlop={6} scaleTo={0.85} disabled={removing}>
              {removing ? <ActivityIndicator size="small" color={colors.danger} /> : <Icon name="trash-outline" size={15} color={colors.danger} />}
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
});

export function TaskList({ tasks, reelId, onUpdate, onAdd, onDelete, kind = 'tasks' }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [newText, setNewText] = useState('');
  const [adding, setAdding] = useState(false);

  const done = tasks.filter(t => t.completed).length;
  const progress = tasks.length ? done / tasks.length : 0;
  const isSteps = kind === 'steps';
  const noun = isSteps ? 'step' : 'task';

  const fill = useRef(new Animated.Value(progress)).current;
  useEffect(() => {
    Animated.spring(fill, { toValue: progress, useNativeDriver: true, speed: 12, bounciness: 8 }).start();
  }, [progress]);

  /**
   * Optimistic. The checkbox used to show a spinner for the whole round-trip,
   * which is what made a tap feel slow — the work was never heavy, the UI just
   * waited on the network. Paint first, reconcile with the server's row after,
   * roll back to the pre-tap task if the call fails.
   */
  const handleToggle = useCallback(async (task: Task) => {
    const next = !task.completed;
    onUpdate({ ...task, completed: next });
    try {
      onUpdate(await api.toggleTask(task.id, next));
    } catch (e: any) {
      onUpdate(task);
      notify(e?.message || `Could not update that ${noun}. Please try again.`);
    }
  }, [onUpdate, noun]);

  const startEdit = useCallback((task: Task) => { setEditingId(task.id); setEditText(task.text); }, []);
  const cancelEdit = useCallback(() => { setEditingId(null); setEditText(''); }, []);

  // Takes the text from the row rather than reading `editText` from scope —
  // otherwise this handler's identity changed on every keystroke and re-rendered
  // every row while typing, which is the thing the memo is meant to prevent.
  /**
   * Optimistic, like the checkbox above. Closes the editor and shows the new
   * text immediately — the row is the user's own words, so there is nothing to
   * wait for the server to tell us.
   *
   * ⚠️ Also FIXES A SILENT FAILURE: this had a `finally` and no `catch`, so a
   * failed edit closed the editor and reverted with no message at all. The
   * server rejecting your change and the app saying nothing is worse than the
   * spinner this replaces.
   */
  const saveEdit = useCallback(async (task: Task, raw: string) => {
    const text = raw.trim();
    if (!text || text === task.text) return cancelEdit();
    onUpdate({ ...task, text });
    cancelEdit();
    try {
      onUpdate(await api.editTask(task.id, text));
    } catch (e: any) {
      onUpdate(task);
      notify(e?.message || `Could not save that ${noun}. Please try again.`);
    }
  }, [onUpdate, cancelEdit, noun]);

  /** Optimistic delete — the row goes on confirm, comes back if the server
   *  refuses. Same silent-failure fix as saveEdit: a failed delete used to
   *  leave the row in place with no explanation, which reads as an ignored tap. */
  const handleDelete = useCallback(async (task: Task) => {
    if (!(await confirmDialog(`Delete this ${noun}?`))) return;
    onDelete(task.id);
    try {
      await api.deleteTask(task.id);
    } catch (e: any) {
      onAdd(task);   // put it back exactly as it was
      notify(e?.message || `Could not delete that ${noun}. Please try again.`);
    }
  }, [noun, onDelete, onAdd]);

  /**
   * Optimistic add. The row appears the instant you hit enter, under a
   * temporary id, and is swapped for the server's row when it lands.
   *
   * The `replaces` argument mirrors TodoEditor's existing convention rather
   * than inventing a second one — see `onOptimistic` there.
   */
  const handleAdd = () => {
    const text = newText.trim();
    if (!text) return;
    const draft: Task = {
      id: `draft-${Date.now()}`,
      reel_id: reelId,
      text,
      // The server picks an emoji; a neutral bullet stands in for the moment
      // the draft is on screen rather than guessing one that then changes.
      emoji: '•',
      estimated_minutes: null,
      completed: false,
      sort_order: tasks.length,
    };
    onAdd(draft);
    setNewText('');
    api.addTask(reelId, text)
      .then(created => onAdd(created, draft.id))
      .catch((e: any) => {
        onDelete(draft.id);
        setNewText(text);   // hand their typing back rather than losing it
        notify(e?.message || `Could not add that ${noun}. Please try again.`);
      });
  };

  return (
    <View style={styles.container}>
      <View style={styles.progressRow}>
        <View style={styles.progressBar}>
          <Animated.View style={[styles.progressFillWrap, { transform: [{ scaleX: fill }] }]}>
            <LinearGradient colors={gradients.success} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.progressFill} />
          </Animated.View>
        </View>
        <Text style={styles.progressText}>{done}/{tasks.length}</Text>
      </View>

      {tasks.map((task, i) => {
        const editing = editingId === task.id;
        return (
          <TaskRow
            key={task.id}
            task={task}
            index={i}
            isSteps={isSteps}
            noun={noun}
            editing={editing}
            editText={editing ? editText : ''}
            savingEdit={editing && savingEdit}
            removing={removing === task.id}
            onToggle={handleToggle}
            onStartEdit={startEdit}
            onSaveEdit={saveEdit}
            onCancelEdit={cancelEdit}
            onChangeEditText={setEditText}
            onDelete={handleDelete}
          />
        );
      })}

      {/* Add a step/task by hand — no AI */}
      <View style={styles.addRow}>
        <TextInput
          style={styles.addInput}
          value={newText}
          onChangeText={setNewText}
          placeholder={`Add a ${noun}…`}
          placeholderTextColor={colors.textSecondary}
          onSubmitEditing={handleAdd}
          returnKeyType="done"
        />
        <Pressable style={[styles.addBtn, !newText.trim() && styles.addBtnDisabled]} onPress={handleAdd} disabled={!newText.trim() || adding} scaleTo={0.9}>
          {adding ? <ActivityIndicator size="small" color={colors.onAction} /> : <Icon name="add" size={18} color={colors.onAction} />}
        </Pressable>
      </View>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  container: { gap: spacing.sm },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  progressBar: { flex: 1, height: 8, backgroundColor: colors.border, borderRadius: radius.full, overflow: 'hidden' },
  // Full width + scaleX from the left edge, so the bar animates on the NATIVE
  // driver. Animating `width` cannot use it and ran the spring on the JS thread,
  // competing with the re-render that triggered it.
  progressFillWrap: { height: '100%', width: '100%', transformOrigin: 'left' },
  progressFill: { flex: 1, borderRadius: radius.full },
  progressText: { color: colors.success, fontSize: font.xs, fontWeight: '800', width: 40, textAlign: 'right' },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.card, borderRadius: radius.md,
    padding: spacing.sm + 2, borderWidth: 1, borderColor: colors.border,
  },
  rowDone: { opacity: 0.55, borderColor: colors.success + '55' },
  check: {
    width: 26, height: 26, borderRadius: radius.full,
    borderWidth: 2, borderColor: colors.borderLight,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  checkStep: { borderColor: colors.accent },
  checkDone: { backgroundColor: colors.success, borderColor: colors.success },
  stepNum: { color: colors.accent, fontSize: font.sm, fontWeight: '800' },
  taskText: { flex: 1 },
  text: { color: colors.textPrimary, fontSize: font.sm, lineHeight: 20, fontWeight: '500' },
  textDone: { textDecorationLine: 'line-through', color: colors.textSecondary },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  time: { color: colors.textTertiary, fontSize: font.xs },

  editInput: {
    flex: 1, color: colors.textPrimary, fontSize: font.sm, lineHeight: 20,
    backgroundColor: colors.surface, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.accent,
    paddingHorizontal: spacing.sm, paddingVertical: 6,
  },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 0 },
  iconBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },

  addRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  addInput: {
    flex: 1, color: colors.textPrimary, fontSize: font.sm,
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  addBtn: {
    width: 40, height: 40, borderRadius: radius.full,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  addBtnDisabled: { backgroundColor: colors.border },
}));
