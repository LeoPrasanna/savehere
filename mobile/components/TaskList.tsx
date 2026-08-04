import { View, Text, StyleSheet, ActivityIndicator, Animated, TextInput, Platform, Alert } from 'react-native';
import { useState, useRef, useEffect } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from './Icon';
import { Task, api } from '../services/api';
import { Pressable } from './Pressable';
import { colors, spacing, font, radius, gradients, themed } from '../constants/theme';

interface Props {
  tasks: Task[];
  reelId: string;
  onUpdate: (updated: Task) => void;
  onAdd: (created: Task) => void;
  onDelete: (id: string) => void;
  kind?: 'steps' | 'tasks';
}

export function TaskList({ tasks, reelId, onUpdate, onAdd, onDelete, kind = 'tasks' }: Props) {
  const [toggling, setToggling] = useState<string | null>(null);
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
    Animated.spring(fill, { toValue: progress, useNativeDriver: false, speed: 12, bounciness: 8 }).start();
  }, [progress]);

  const confirm = (msg: string): Promise<boolean> =>
    new Promise(resolve => {
      if (Platform.OS === 'web') return resolve(window.confirm(msg));
      Alert.alert('', msg, [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
      ]);
    });

  const handleToggle = async (task: Task) => {
    if (editingId === task.id) return;
    setToggling(task.id);
    try {
      const updated = await api.toggleTask(task.id, !task.completed);
      onUpdate(updated);
    } finally {
      setToggling(null);
    }
  };

  const startEdit = (task: Task) => { setEditingId(task.id); setEditText(task.text); };
  const cancelEdit = () => { setEditingId(null); setEditText(''); };

  const saveEdit = async (task: Task) => {
    const text = editText.trim();
    if (!text || text === task.text) return cancelEdit();
    setSavingEdit(true);
    try {
      const updated = await api.editTask(task.id, text);
      onUpdate(updated);
      cancelEdit();
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (task: Task) => {
    if (!(await confirm(`Delete this ${noun}?`))) return;
    setRemoving(task.id);
    try {
      await api.deleteTask(task.id);
      onDelete(task.id);
    } finally {
      setRemoving(null);
    }
  };

  const handleAdd = async () => {
    const text = newText.trim();
    if (!text) return;
    setAdding(true);
    try {
      const created = await api.addTask(reelId, text);
      onAdd(created);
      setNewText('');
    } finally {
      setAdding(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.progressRow}>
        <View style={styles.progressBar}>
          <Animated.View style={[styles.progressFillWrap, { width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}>
            <LinearGradient colors={gradients.success} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.progressFill} />
          </Animated.View>
        </View>
        <Text style={styles.progressText}>{done}/{tasks.length}</Text>
      </View>

      {tasks.map((task, i) => {
        const editing = editingId === task.id;
        return (
          <View key={task.id} style={[styles.row, task.completed && !editing && styles.rowDone]}>
            <Pressable
              style={[styles.check, isSteps && !task.completed && styles.checkStep, task.completed && styles.checkDone]}
              onPress={() => handleToggle(task)}
              scaleTo={0.9}
              disabled={editing}
            >
              {toggling === task.id
                ? <ActivityIndicator size="small" color={task.completed ? colors.onAction : colors.textPrimary} />
                : task.completed
                  ? <Icon name="checkmark" size={15} color={colors.onAction} />
                  : isSteps
                    ? <Text style={styles.stepNum}>{i + 1}</Text>
                    : null}
            </Pressable>

            <Icon name={task.emoji} size={18} color={colors.accentLight} />

            {editing ? (
              <TextInput
                style={styles.editInput}
                value={editText}
                onChangeText={setEditText}
                autoFocus
                multiline
                placeholder={`Edit ${noun}…`}
                placeholderTextColor={colors.textSecondary}
                onSubmitEditing={() => saveEdit(task)}
              />
            ) : (
              <Pressable style={styles.taskText} onPress={() => handleToggle(task)} scaleTo={0.99}>
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
                  <Pressable style={styles.iconBtn} onPress={() => saveEdit(task)} hitSlop={6} scaleTo={0.85} disabled={savingEdit}>
                    {savingEdit ? <ActivityIndicator size="small" color={colors.success} /> : <Icon name="checkmark" size={16} color={colors.success} />}
                  </Pressable>
                  <Pressable style={styles.iconBtn} onPress={cancelEdit} hitSlop={6} scaleTo={0.85}>
                    <Icon name="close" size={16} color={colors.textTertiary} />
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable style={styles.iconBtn} onPress={() => startEdit(task)} hitSlop={6} scaleTo={0.85}>
                    <Icon name="create" size={15} color={colors.textTertiary} />
                  </Pressable>
                  <Pressable style={styles.iconBtn} onPress={() => handleDelete(task)} hitSlop={6} scaleTo={0.85} disabled={removing === task.id}>
                    {removing === task.id ? <ActivityIndicator size="small" color={colors.danger} /> : <Icon name="trash-outline" size={15} color={colors.danger} />}
                  </Pressable>
                </>
              )}
            </View>
          </View>
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
  progressFillWrap: { height: '100%' },
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
