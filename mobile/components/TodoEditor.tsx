import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { api, Todo, TodoPriority } from '../services/api';
import { Pressable } from './Pressable';
import { Icon } from './Icon';
import { daysFromToday, nextWeekend, formatDue, parseLocal } from '../services/todoDates';
import * as haptics from '../services/haptics';
import { colors, spacing, font, radius, gradients, shadow, themed } from '../constants/theme';

const PRIORITIES: { key: TodoPriority; label: string; color: string }[] = [
  { key: 'high', label: 'High', color: colors.danger },
  { key: 'medium', label: 'Medium', color: colors.warning },
  { key: 'low', label: 'Low', color: colors.textSecondary },
];

/** Quick-pick dates cover essentially every real to-do. Deliberately NOT a
 *  calendar picker: that needs a native-only dependency and behaves differently
 *  on web. The text field below handles the rare specific date. */
const DATE_PRESETS = (): { label: string; value: string | null }[] => ([
  { label: 'Today', value: daysFromToday(0) },
  { label: 'Tomorrow', value: daysFromToday(1) },
  { label: 'Weekend', value: nextWeekend() },
  { label: 'Next week', value: daysFromToday(7) },
  { label: 'Someday', value: null },
]);

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved: (todo: Todo) => void;
  /** Create-from-a-save: links the todo to this reel and lets the server copy
   *  in the reel's title + summary when the fields are left untouched. */
  reelId?: string;
  /** Prefill for the reel flow (shown so the user can edit before saving). */
  defaultTitle?: string;
  defaultDescription?: string;
  /** Present = edit an existing todo instead of creating one. */
  editing?: Todo | null;
}

export function TodoEditor({
  visible, onClose, onSaved, reelId, defaultTitle, defaultDescription, editing,
}: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TodoPriority>('medium');
  const [due, setDue] = useState<string | null>(null);
  const [typedDate, setTypedDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Web ghost-click guard — same pattern as the reel screen's modals: a
  // double-click's second click lands on the freshly mounted overlay.
  const openedAt = useRef(0);

  useEffect(() => {
    if (!visible) return;
    openedAt.current = Date.now();
    setTitle(editing?.title ?? defaultTitle ?? '');
    setDescription(editing?.description ?? defaultDescription ?? '');
    setPriority(editing?.priority ?? 'medium');
    setDue(editing?.due_date ?? null);
    setTypedDate(editing?.due_date ?? '');
    setError(null);
  }, [visible, editing, defaultTitle, defaultDescription]);

  const dismiss = () => {
    if (Date.now() - openedAt.current < 350) return;
    onClose();
  };

  const pickPreset = (value: string | null) => {
    setDue(value);
    setTypedDate(value ?? '');
    setError(null);
  };

  const onTypedDate = (text: string) => {
    setTypedDate(text);
    if (!text.trim()) { setDue(null); setError(null); return; }
    // Validated here so a typo becomes a clear message instead of a 422 after
    // the user has already hit Save.
    if (parseLocal(text.trim())) { setDue(text.trim()); setError(null); }
    else setError('Use the format YYYY-MM-DD, or tap one of the chips above.');
  };

  const canSave = title.trim().length > 0 && !saving && !error;

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        title: title.trim(),
        description: description.trim() || null,
        priority,
        due_date: due,
        // due_date is nullable, so the server can't tell "omitted" from "clear it".
        clear_due_date: due === null,
      };
      const saved = editing
        ? await api.updateTodo(editing.id, body)
        : reelId
          ? await api.createTodoFromReel(reelId, body)
          : await api.createTodo({ ...body, title: title.trim() });
      haptics.success();
      onSaved(saved);
      onClose();
    } catch (e: any) {
      haptics.error();
      setError(e?.message || 'Could not save that. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.overlay} onPress={dismiss} scaleTo={1}>
        {/* Card swallows its own presses so typing inside never bubbles to the
            close-on-press overlay (react-native-web). */}
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()} scaleTo={1}>
          <View style={styles.headRow}>
            <Text style={styles.heading}>{editing ? 'Edit to-do' : 'New to-do'}</Text>
            <Pressable onPress={onClose} scaleTo={0.9} hitSlop={8}>
              <Icon name="close" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {reelId && !editing && (
              <View style={styles.linkNote}>
                <Icon name="link" size={12} color={colors.accentLight} />
                <Text style={styles.linkNoteText}>Linked to this save — it stays on your list even if you delete the reel.</Text>
              </View>
            )}

            <Text style={styles.label}>TITLE</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="What do you want to do?"
              placeholderTextColor={colors.textTertiary}
              maxLength={200}
              autoFocus={!editing}
              returnKeyType="done"
              onSubmitEditing={submit}
            />

            <Text style={styles.label}>NOTES (OPTIONAL)</Text>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              value={description}
              onChangeText={setDescription}
              placeholder="Anything worth remembering"
              placeholderTextColor={colors.textTertiary}
              maxLength={2000}
              multiline
            />

            <Text style={styles.label}>WHEN</Text>
            <View style={styles.chipRow}>
              {DATE_PRESETS().map(p => {
                const on = due === p.value;
                return (
                  <Pressable
                    key={p.label}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() => pickPreset(p.value)}
                    scaleTo={0.95}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{p.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              style={[styles.input, styles.dateInput]}
              value={typedDate}
              onChangeText={onTypedDate}
              placeholder="Or a specific date — YYYY-MM-DD"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              maxLength={10}
            />

            <Text style={styles.label}>PRIORITY</Text>
            <View style={styles.chipRow}>
              {PRIORITIES.map(p => {
                const on = priority === p.key;
                return (
                  <Pressable
                    key={p.key}
                    style={[styles.chip, on && { backgroundColor: p.color + '24', borderColor: p.color }]}
                    onPress={() => setPriority(p.key)}
                    scaleTo={0.95}
                  >
                    <Text style={[styles.chipText, on && { color: p.color }]}>{p.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {error && (
              <View style={styles.errorRow}>
                <Icon name="alert-circle" size={14} color={colors.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
          </ScrollView>

          <Pressable style={styles.saveWrap} onPress={submit} scaleTo={0.97} disabled={!canSave}>
            <LinearGradient
              colors={gradients.primary}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={[styles.saveBtn, !canSave && styles.saveBtnOff]}
            >
              {saving
                ? <ActivityIndicator color="#FFF" size="small" />
                : <Text style={styles.saveText}>{editing ? 'Save changes' : `Add${due ? ` · ${formatDue(due)}` : ''}`}</Text>}
            </LinearGradient>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = themed(() => StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', padding: spacing.lg,
  },
  card: {
    width: '100%', maxWidth: 460, maxHeight: '86%',
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.lg, ...shadow.md,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { color: colors.textPrimary, fontSize: font.lg, fontWeight: '800' },

  body: { marginTop: spacing.sm },
  bodyContent: { paddingBottom: spacing.sm },

  linkNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs,
    backgroundColor: colors.accent + '14', borderRadius: radius.sm,
    padding: spacing.sm, marginBottom: spacing.sm,
  },
  linkNoteText: { flex: 1, color: colors.accentLight, fontSize: font.xs, lineHeight: 16 },

  label: {
    color: colors.textTertiary, fontSize: font.xs, fontWeight: '800',
    letterSpacing: 1.1, marginTop: spacing.md, marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.borderLight,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    color: colors.textPrimary, fontSize: font.md,
  },
  inputMulti: { minHeight: 72, textAlignVertical: 'top' },
  dateInput: { marginTop: spacing.xs, fontSize: font.sm },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.sm + 4, paddingVertical: 7, borderRadius: radius.full,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.accent + '24', borderColor: colors.accent },
  chipText: { color: colors.textSecondary, fontSize: font.xs, fontWeight: '700' },
  chipTextOn: { color: colors.accentLight },

  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, marginTop: spacing.md },
  errorText: { flex: 1, color: colors.danger, fontSize: font.xs, lineHeight: 16 },

  saveWrap: { borderRadius: radius.md, marginTop: spacing.md },
  saveBtn: { borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', justifyContent: 'center', minHeight: 50 },
  saveBtnOff: { opacity: 0.45 },
  saveText: { color: '#FFF', fontSize: font.md, fontWeight: '800' },
}));
