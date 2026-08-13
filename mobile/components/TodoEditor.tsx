import { useState, useEffect, useRef, memo } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, ScrollView, ActivityIndicator, KeyboardAvoidingView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { api, Todo, TodoPriority } from '../services/api';
import { Pressable } from './Pressable';
import { Icon } from './Icon';
import { DatePicker } from './DatePicker';
import { daysFromToday, nextWeekend, formatDue } from '../services/todoDates';
import * as haptics from '../services/haptics';
import { colors, spacing, font, radius, gradients, shadow, themed } from '../constants/theme';

const PRIORITIES: { key: TodoPriority; label: string; color: string }[] = [
  { key: 'high', label: 'High', color: colors.danger },
  { key: 'medium', label: 'Medium', color: colors.warning },
  { key: 'low', label: 'Low', color: colors.textSecondary },
];

/** Quick-picks for the dates people actually choose. The calendar below covers
 *  anything else — these just save four taps for the common cases. */
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
  /** `replaces` is the temporary id handed to `onOptimistic`, if that path ran. */
  onSaved: (todo: Todo, replaces?: string) => void;
  /**
   * Optional FAST PATH for creating a new task.
   *
   * ⚠️ Without this the sheet stayed open `await`ing the create. On a cold
   * backend that is several seconds of spinner before a task the user has
   * already fully described appears — which reads as the app being broken.
   *
   * When supplied, the sheet closes immediately, the parent shows a draft row,
   * and the request runs behind it. `onSaved` swaps the draft for the real row;
   * `onFailed` removes it and surfaces the reason. Nothing is left in a silent
   * half-saved state either way.
   *
   * Not used when EDITING — an edit has a row on screen already, and swapping
   * it out from under the user would be worse than a brief spinner.
   */
  onOptimistic?: (draft: Todo) => void;
  onFailed?: (draftId: string, message: string) => void;
  /**
   * A failed EDIT, after the sheet has already closed.
   *
   * Deliberately separate from `onFailed`: that one removes a row by id, which
   * is right for a create that never landed and catastrophically wrong for an
   * edit — it would delete the user's existing task because renaming it
   * failed. This one only reports; the editor has already restored the
   * original row via `onSaved`.
   */
  onError?: (message: string) => void;
  /** Create-from-a-save: links the todo to this reel and lets the server copy
   *  in the reel's title + summary when the fields are left untouched. */
  reelId?: string;
  /** Prefill for the reel flow (shown so the user can edit before saving). */
  defaultTitle?: string;
  defaultDescription?: string;
  /** Present = edit an existing todo instead of creating one. */
  editing?: Todo | null;
  /** Starting priority for a NEW task, from the user's list settings. */
  defaultPriority?: TodoPriority;
}

function TodoEditorImpl({
  visible, onClose, onSaved, onOptimistic, onFailed, onError, reelId, defaultTitle, defaultDescription, editing,
  defaultPriority = 'medium',
}: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TodoPriority>('medium');
  const [due, setDue] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Web ghost-click guard — same pattern as the reel screen's modals: a
  // double-click's second click lands on the freshly mounted overlay.
  const openedAt = useRef(0);

  /**
   * ⚠️ SEED ONCE PER OPENING, NOT ON EVERY PROP CHANGE.
   *
   * This effect used to run whenever any dep changed while the sheet was OPEN,
   * and every run calls `setDue(editing?.due_date ?? null)` — silently throwing
   * away the date the user had just tapped. That is the "the date chips don't
   * update" bug, and it also reset the title mid-typing.
   *
   * The deps are not stable in practice:
   *  • todos.tsx passes `defaultPriority={settings.defaultPriority}`, which
   *    changes when the settings sheet writes.
   *  • reel/[id].tsx passes `defaultDescription={reel.summary?.join('\n')}`,
   *    and that screen RE-FETCHES the reel every 2.5s while the summary is
   *    pending — so a save whose summary was still generating re-seeded this
   *    form roughly every two and a half seconds while you were filling it in.
   *
   * Latching on the false→true transition is the fix: reopening still seeds
   * fresh (the latch clears on close), but nothing touches your input while
   * the sheet is up.
   */
  const seeded = useRef(false);

  useEffect(() => {
    if (!visible) { seeded.current = false; return; }
    if (seeded.current) return;
    seeded.current = true;
    openedAt.current = Date.now();
    setTitle(editing?.title ?? defaultTitle ?? '');
    setDescription(editing?.description ?? defaultDescription ?? '');
    setPriority(editing?.priority ?? defaultPriority);
    setDue(editing?.due_date ?? null);
    // Open straight onto the calendar when editing something that already has a
    // date — that's usually what you came to change.
    setCalendarOpen(!!editing?.due_date);
    setError(null);
  }, [visible, editing, defaultTitle, defaultDescription, defaultPriority]);

  const dismiss = () => {
    if (Date.now() - openedAt.current < 350) return;
    onClose();
  };

  const pickPreset = (value: string | null) => {
    setDue(value);
    setError(null);
  };

  const canSave = title.trim().length > 0 && !saving && !error;

  const submit = async () => {
    if (!canSave) return;
    setError(null);
    const body = {
      title: title.trim(),
      description: description.trim() || null,
      priority,
      due_date: due,
      // due_date is nullable, so the server can't tell "omitted" from "clear it".
      clear_due_date: due === null,
    };

    // ── Fast path: close now, save behind it. See `onOptimistic` above. ──
    if (onOptimistic && !editing) {
      const draft: Todo = {
        id: `draft-${Date.now()}`,
        reel_id: reelId ?? null,
        title: body.title,
        description: body.description,
        priority,
        due_date: due,
        completed: false,
        completed_at: null,
        completed_on: null,
        created_at: new Date().toISOString(),
      };
      haptics.success();
      onOptimistic(draft);
      onClose();
      try {
        const saved = reelId
          ? await api.createTodoFromReel(reelId, body)
          : await api.createTodo({ ...body, title: body.title });
        onSaved(saved, draft.id);
      } catch (e: any) {
        haptics.error();
        onFailed?.(draft.id, e?.message || 'Could not save that. Try again.');
      }
      return;
    }

    /**
     * ── EDIT: optimistic too (owner, 2026-08-12) ──────────────────────────
     *
     * Changing a due date is the most common edit there is, and it sat behind
     * a spinner for a full round-trip — on a cold backend, several seconds to
     * change a date the user had already picked, on a row that is already on
     * screen. The new values are entirely the user's own input; there is
     * nothing the server needs to tell us before showing them.
     *
     * The ORIGINAL row is kept and restored if the write fails, and the reason
     * is surfaced through `onError`. Note the failure mode differs from a
     * create: a failed create removes a row that never existed, a failed edit
     * must put the OLD row back — which is why `onFailed` (which deletes by id)
     * would be exactly wrong here.
     */
    if (editing) {
      const previous = editing;
      haptics.success();
      onSaved({ ...editing, ...body, description: body.description ?? null });
      onClose();
      try {
        onSaved(await api.updateTodo(editing.id, body));
      } catch (e: any) {
        haptics.error();
        onSaved(previous);
        onError?.(e?.message || 'Could not save that change. Try again.');
      }
      return;
    }

    setSaving(true);
    try {
      const saved = reelId
        ? await api.createTodoFromReel(reelId, body)
        : await api.createTodo({ ...body, title: body.title });
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
      {/* ⚠️ THE MODAL NEEDS ITS OWN KeyboardAvoidingView. A Modal is a separate
          Android window, so it is never resized by the IME even where the main
          window would be — and this sheet centres itself, autofocuses the title
          and puts WHEN/PRIORITY/Add BELOW that field. The keyboard covered
          exactly the controls you needed next. `padding` (not `height`) so the
          card shrinks from the bottom rather than jumping. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <Pressable style={styles.overlay} onPress={dismiss} scaleTo={1}>
        {/* Card swallows its own presses so typing inside never bubbles to the
            close-on-press overlay (react-native-web). */}
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()} scaleTo={1}>
          <View style={styles.headRow}>
            <Text style={styles.heading}>{editing ? 'Edit task' : 'New task'}</Text>
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
              /* ⚠️ Enter must NOT save. This was `returnKeyType="done"` +
                 `onSubmitEditing={submit}`, so typing a title and hitting
                 Enter — the reflex on any single-line field — created the task
                 and closed the sheet before you ever reached WHEN or PRIORITY.
                 The date chips below then "did nothing" because there was no
                 sheet left. Enter now just DISMISSES the keyboard, which is the
                 useful thing to do here — it uncovers WHEN, PRIORITY and the
                 Add button. Saving is the button, and only the button. */
              returnKeyType="done"
              submitBehavior="blurAndSubmit"
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
            <Pressable
              style={styles.calToggle}
              onPress={() => setCalendarOpen(o => !o)}
              scaleTo={0.98}
            >
              <Icon name="time" size={13} color={colors.textSecondary} />
              <Text style={styles.calToggleText}>
                {calendarOpen ? 'Hide calendar' : 'Pick a specific date'}
              </Text>
              <Text style={styles.calToggleValue}>{formatDue(due)}</Text>
            </Pressable>
            {calendarOpen && (
              <View style={{ marginTop: spacing.xs }}>
                <DatePicker value={due} onChange={(iso) => { setDue(iso); setError(null); }} />
              </View>
            )}

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
                ? <ActivityIndicator color={colors.onAction} size="small" />
                : <Text style={styles.saveText}>{editing ? 'Save changes' : `Add${due ? ` · ${formatDue(due)}` : ''}`}</Text>}
            </LinearGradient>
          </Pressable>
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
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

  calToggle: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    marginTop: spacing.xs, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm,
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.card,
  },
  calToggleText: { flex: 1, color: colors.textSecondary, fontSize: font.xs, fontWeight: '700' },
  calToggleValue: { color: colors.accentLight, fontSize: font.xs, fontWeight: '800' },

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
  saveText: { color: colors.onAction, fontSize: font.md, fontWeight: '800' },
}));

/** Memoized: the sheet stays MOUNTED while closed so <Modal animationType="fade">
 *  keeps its exit animation, but its body (ScrollView, date presets, priority
 *  list) no longer re-evaluates every time the todos screen re-renders.
 *  Requires stable handler props — see the useCallbacks in app/todos.tsx. */
export const TodoEditor = memo(TodoEditorImpl);
