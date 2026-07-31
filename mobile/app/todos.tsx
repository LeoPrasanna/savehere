import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Modal } from 'react-native';
import { useRouter, useFocusEffect, useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView, AnimatePresence } from 'moti';
import { api, Todo, TodoStats } from '../services/api';
import { Pressable } from '../components/Pressable';
import { Icon } from '../components/Icon';
import { TodoEditor } from '../components/TodoEditor';
import { RollingTagline } from '../components/RollingTagline';
import { TodoGoalBar } from '../components/TodoGoalBar';
import { TodoSettingsSheet } from '../components/TodoSettingsSheet';
import { ProfilePanel } from '../components/ProfilePanel';
import { goHome } from '../components/HomeButton';
import { markEnteredLibrary } from '../services/sessionFlags';
import { bucketOf, formatDue, todayISO, Bucket } from '../services/todoDates';
import { useTodoSettings } from '../services/todoSettings';
import { TODO_QUOTES, TODO_ROLL_NAMES, TODO_ADD_LABEL } from '../constants/todoBrand';
import * as haptics from '../services/haptics';
import { colors, spacing, font, radius, gradients, shadow, themed } from '../constants/theme';

const PRIORITY_COLOR: Record<string, string> = {
  high: colors.danger,
  medium: colors.warning,
  low: colors.textTertiary,
};

/** "Someday" sits last by default — undated items are the ones you're least
 *  committed to, and burying them keeps the top of the list honest. Settings can
 *  flip it for people who work the other way round. */
const SECTIONS: { key: Bucket; label: string }[] = [
  { key: 'overdue', label: 'OVERDUE' },
  { key: 'today', label: 'TODAY' },
  { key: 'upcoming', label: 'UPCOMING' },
  { key: 'someday', label: 'SOMEDAY' },
];

/** Only the name + emoji rolls — "My" is fixed beside it, so it reads as one
 *  steady phrase with a changing tail rather than the whole title flickering. */
const ROLL_LINES = TODO_ROLL_NAMES.map(n => `${n.name} ${n.emoji}`);

/** Settings button that spins a full turn each time it's pressed.
 *  Press-triggered rather than always-spinning on purpose: perpetual motion in
 *  the corner of a list you're trying to read is a distraction, not a delight. */
function SpinningGear({ onPress }: { onPress: () => void }) {
  const [turns, setTurns] = useState(0);
  return (
    <Pressable
      style={styles.gearBtn}
      onPress={() => { setTurns(t => t + 1); onPress(); }}
      scaleTo={0.9}
      hitSlop={8}
    >
      <MotiView
        animate={{ rotate: `${turns * 360}deg` }}
        transition={{ type: 'timing', duration: 520 }}
      >
        <Icon name="settings" size={20} color={colors.textPrimary} />
      </MotiView>
    </Pressable>
  );
}

function StatTile({ label, value, tint }: { label: string; value: number; tint?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, tint ? { color: tint } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function TodoRow({ todo, onToggle, onEdit, onOpenReel, onDelete }: {
  todo: Todo;
  onToggle: () => void;
  onEdit: () => void;
  onOpenReel: () => void;
  onDelete: () => void;
}) {
  const overdue = bucketOf(todo.due_date) === 'overdue' && !todo.completed;
  const done = todo.completed;
  return (
    // The whole row eases back when it's done: it stays readable (so tapping
    // again to undo is obvious) but visibly stops competing with what's left.
    <MotiView
      animate={{ opacity: done ? 0.62 : 1, scale: done ? 0.99 : 1 }}
      transition={{ type: 'timing', duration: 260 }}
      style={[styles.row, done && styles.rowDone]}
    >
      <Pressable onPress={onToggle} scaleTo={0.85} hitSlop={8} style={styles.check}>
        <View style={[styles.checkBox, done && styles.checkBoxOn]}>
          <AnimatePresence>
            {done && (
              <MotiView
                // Springs in from nothing so the tick lands with some weight —
                // this is the moment the whole feature is asking the user to enjoy.
                from={{ scale: 0, opacity: 0, rotate: '-45deg' }}
                animate={{ scale: 1, opacity: 1, rotate: '0deg' }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: 'spring', damping: 11, stiffness: 220 }}
              >
                <Icon name="checkmark" size={13} color="#FFF" />
              </MotiView>
            )}
          </AnimatePresence>
        </View>

        {/* One-shot ring that expands and fades the instant it's ticked. */}
        <AnimatePresence>
          {done && (
            <MotiView
              key={`burst-${todo.id}`}
              pointerEvents="none"
              from={{ scale: 0.7, opacity: 0.55 }}
              animate={{ scale: 2.1, opacity: 0 }}
              transition={{ type: 'timing', duration: 520 }}
              style={styles.burst}
            />
          )}
        </AnimatePresence>
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
    </MotiView>
  );
}

export default function TodosScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [stats, setStats] = useState<TodoStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Todo | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Only for the profile panel's "saves" counter. Fetched when the panel opens
  // rather than on mount — this screen otherwise has no reason to touch reels.
  const [reelTotal, setReelTotal] = useState<number | undefined>(undefined);
  const { settings, update: updateSettings, ready: settingsReady } = useTodoSettings();
  // Set when a reel-linked task is completed: the "delete the saved card?" ask.
  const [finished, setFinished] = useState<Todo | null>(null);
  const [deletingReel, setDeletingReel] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      // The device's own date decides what "today" means for the goal — see
      // services/todoSettings.ts and the completed_on column.
      const d = await api.listTodos(settings.showCompleted, todayISO());
      setTodos(d.items);
      setStats(d.stats);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Couldn't load your list.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [settings.showCompleted]);

  useFocusEffect(useCallback(() => {
    // The rolling hero is the page title, so the nav bar stays bare — and the
    // stack's global Home button is dropped here because this screen has its own
    // Home/Library pair in the body. Two home buttons on one screen is worse
    // than none.
    navigation.setOptions({ title: '', headerRight: () => null });
    if (settingsReady) load();
  }, [load, navigation, settingsReady]));

  /** `/` renders the landing page OR the library off a session flag; setting it
   *  first is what makes this land on the library rather than the greeting. */
  const openLibrary = () => {
    markEnteredLibrary();
    router.replace('/');
  };

  const openPanel = () => {
    setMenuOpen(true);
    // Only for the panel's saves counter, and only the first time it's opened.
    if (reelTotal === undefined) {
      api.listReels({ limit: 1 }).then(d => setReelTotal(d.total)).catch(() => {});
    }
  };

  const toggle = async (todo: Todo) => {
    const next = !todo.completed;
    // Optimistic, and the item STAYS in place while checked — tapping again is
    // the undo. It drops off the list on the next load, which is the natural
    // moment for it to disappear.
    setTodos(ts => ts.map(t => (t.id === todo.id ? { ...t, completed: next } : t)));
    setStats(s => s && {
      ...s,
      open: s.open + (next ? -1 : 1),
      completed: s.completed + (next ? 1 : -1),
      completed_today: s.completed_today === null
        ? null
        : Math.max(0, s.completed_today + (next ? 1 : -1)),
    });
    next ? haptics.success() : haptics.tap();

    // Shown IMMEDIATELY, before the request — not after it. Waiting on the round
    // trip meant a cold Render instance could leave the user staring at a ticked
    // box for seconds before anything acknowledged it. The prompt only offers to
    // delete a save, and that deletion is its own explicit confirmed action, so
    // there is nothing unsafe about asking optimistically; a failed update
    // dismisses it again below.
    if (next && todo.reel_id && settings.askDeleteSaveOnDone) {
      setFinished({ ...todo, completed: true });
    }

    try {
      await api.updateTodo(todo.id, {
        completed: next,
        // Stamped from the DEVICE, so the daily goal counts against the user's
        // own calendar day rather than the server's UTC one.
        completed_on: next ? todayISO() : null,
      });
    } catch (e: any) {
      // The tick didn't stick, so the celebration mustn't stand either.
      setFinished(null);
      setTodos(ts => ts.map(t => (t.id === todo.id ? { ...t, completed: !next } : t)));
      setStats(s => s && {
        ...s,
        open: s.open + (next ? 1 : -1),
        completed: s.completed + (next ? -1 : 1),
        completed_today: s.completed_today === null
          ? null
          : Math.max(0, s.completed_today + (next ? -1 : 1)),
      });
      setError(e?.message || "Couldn't update that.");
    }
  };

  /** "Yes, delete the saved card." The task itself survives — the server
   *  unlinks it rather than cascading, so the record of what you did remains. */
  const deleteLinkedReel = async () => {
    if (!finished?.reel_id) return;
    setDeletingReel(true);
    try {
      await api.deleteReel(finished.reel_id);
      haptics.warning();
      setFinished(null);
      load();
    } catch (e: any) {
      setError(e?.message || "Couldn't delete that save.");
      setFinished(null);
    } finally {
      setDeletingReel(false);
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

  const order = settings.somedayFirst
    ? [SECTIONS[3], SECTIONS[0], SECTIONS[1], SECTIONS[2]]
    : SECTIONS;
  const grouped = order
    .map(s => ({ ...s, items: todos.filter(t => bucketOf(t.due_date) === s.key) }))
    .filter(s => s.items.length > 0);

  // Computed here, not server-side: "overdue" depends on the DEVICE's calendar
  // day, and a UTC-derived count would disagree with the sections below it.
  const overdueCount = todos.filter(t => !t.completed && bucketOf(t.due_date) === 'overdue').length;

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
        {/* ── Quick nav. Home and Library sit together as a pair (they're the
            two places you'd leave for); the hamburger keeps its own slot. The
            stack header's own Home button is suppressed below so there aren't
            two of them on one screen. ── */}
        <View style={styles.navRow}>
          <View style={styles.navPair}>
            <Pressable style={styles.navBtn} onPress={goHome} scaleTo={0.94} hitSlop={6}>
              <Icon name="home" size={16} color={colors.textPrimary} />
              <Text style={styles.navBtnText}>Home</Text>
            </Pressable>
            <View style={styles.navSplit} />
            <Pressable style={styles.navBtn} onPress={openLibrary} scaleTo={0.94} hitSlop={6}>
              <Icon name="bookmark" size={16} color={colors.textPrimary} />
              <Text style={styles.navBtnText}>Library</Text>
            </Pressable>
          </View>
          <View style={{ flex: 1 }} />
          <Pressable style={styles.iconBtn} onPress={openPanel} scaleTo={0.9} hitSlop={8}>
            <Icon name="menu" size={18} color={colors.textPrimary} />
          </Pressable>
        </View>

        {/* ── Hero: "MY" in the accent colour, the rolling name right beside it.
            Inline (owner) — so the pair owns a full row on its own and the
            rolling half is clamped to one line. The longest names still just
            fit at this size; anything longer would ellipsize rather than wrap
            out of the viewport. ── */}
        <View style={styles.heroRow}>
          <Text style={styles.heroFixed}>MY</Text>
          <RollingTagline
            lines={ROLL_LINES}
            height={34}
            intervalMs={5200}
            numberOfLines={1}
            alignLeft
            textStyle={styles.heroText}
            style={styles.heroRoll}
          />
        </View>

        {/* ── Dashboard: where you stand, plus something worth reading ──── */}
        <View style={styles.dash}>
          {/* Rendered only once settings have loaded, so the bar can't flash the
              default goal and then snap to the user's real one. */}
          {settingsReady && stats?.completed_today !== null && stats?.completed_today !== undefined && (
            <TodoGoalBar done={stats.completed_today} goal={settings.dailyGoal} />
          )}
          <View style={styles.statRow}>
            <StatTile label="OPEN" value={stats?.open ?? 0} />
            <StatTile label="DONE" value={stats?.completed ?? 0} tint={colors.success} />
            <StatTile
              label="OVERDUE"
              value={overdueCount}
              tint={overdueCount > 0 ? colors.danger : undefined}
            />
          </View>
          <RollingTagline compact lines={TODO_QUOTES} style={styles.quotes} />
        </View>

        {error && (
          <Pressable style={styles.errorBanner} onPress={() => load()} scaleTo={0.99}>
            <Icon name="alert-circle" size={14} color={colors.danger} />
            <Text style={styles.errorText}>{error} Tap to retry.</Text>
          </Pressable>
        )}

        {todos.length === 0 && !error ? (
          <View style={styles.empty}>
            <Icon name="checkbox" size={44} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>Nothing to follow through on</Text>
            <Text style={styles.emptyText}>
              Add something you want to get done — or open a save and tap “{TODO_ADD_LABEL}”
              to turn it into a real plan.
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
            <Text style={styles.addText}>New task</Text>
          </LinearGradient>
        </Pressable>
        {/* Settings live bottom-right (owner) — out of the reading path, still
            one thumb-reach away on a phone. */}
        <SpinningGear onPress={() => setSettingsOpen(true)} />
      </View>

      <TodoEditor
        visible={editorOpen}
        editing={editing}
        defaultPriority={settings.defaultPriority}
        onClose={() => { setEditorOpen(false); setEditing(null); }}
        onSaved={onSaved}
      />

      <ProfilePanel
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        reels={[]}
        total={reelTotal}
      />

      <TodoSettingsSheet
        visible={settingsOpen}
        settings={settings}
        onChange={updateSettings}
        onClose={() => setSettingsOpen(false)}
      />

      {/* ── Done → keep or delete the save it came from ────────────────────
          "Keep it" is the primary action and the only thing a stray tap can
          reach: deleting a reel cascades to its summary, notes, tasks, workout
          and itinerary, and there is no trash to recover it from. The delete
          button is styled as the destructive secondary and says what is lost. */}
      <Modal visible={!!finished} transparent animationType="fade" onRequestClose={() => setFinished(null)} statusBarTranslucent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}>
              <Icon name="celebrate" size={26} color={colors.success} />
            </View>
            <Text style={styles.modalTitle}>Done — nice one.</Text>
            <Text style={styles.modalBody} numberOfLines={3}>“{finished?.title}”</Text>
            <Text style={styles.modalAsk}>
              You've followed through on this one. Want to clear the saved card out of your
              library too?
            </Text>
            <Text style={styles.modalWarn}>
              Deleting also removes its summary, notes, any generated steps or workout — and
              it can't be undone. Your completed task stays either way.
            </Text>

            <Pressable style={styles.keepWrap} onPress={() => setFinished(null)} scaleTo={0.97}>
              <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.keepBtn}>
                <Text style={styles.keepText}>Keep the save</Text>
              </LinearGradient>
            </Pressable>
            <Pressable style={styles.dangerBtn} onPress={deleteLinkedReel} scaleTo={0.97} disabled={deletingReel}>
              {deletingReel
                ? <ActivityIndicator color={colors.danger} size="small" />
                : <Text style={styles.dangerText}>Delete the saved card</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg, flexGrow: 1 },

  // ── Quick nav ───────────────────────────────────────────────────────
  navRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  // Home and Library share one pill with a hairline between them, so they read
  // as a pair of related destinations rather than two unrelated buttons.
  navPair: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.card, borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.border,
  },
  navBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: 9,
  },
  navBtnText: { color: colors.textPrimary, fontSize: font.xs, fontWeight: '700' },
  navSplit: { width: 1, height: 18, backgroundColor: colors.border },

  // ── Hero ────────────────────────────────────────────────────────────
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  // Accent-coloured, so it tracks whichever Appearance theme is active.
  heroFixed: {
    color: colors.accent, fontSize: font.xxl,
    fontWeight: '800', letterSpacing: 0.5, lineHeight: 34,
  },
  heroRoll: { flex: 1, alignSelf: 'auto' },
  // A notch smaller than "MY" deliberately. Inline means the rolling half only
  // gets the row minus "MY", and the longest entries ("Program of Entertainment
  // 🎪", "Things as They Happened ⏳") would ellipsize at 28px on a narrow
  // phone. 22 keeps every name whole while "MY" still anchors the line.
  heroText: {
    fontSize: font.xl, fontWeight: '800', color: colors.textPrimary,
    textAlign: 'left', paddingHorizontal: 0, lineHeight: 30, fontStyle: 'normal',
  },
  iconBtn: {
    width: 38, height: 38, borderRadius: radius.full,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  gearBtn: {
    width: 50, height: 50, borderRadius: radius.md,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Dashboard header ────────────────────────────────────────────────
  dash: {
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, gap: spacing.sm,
  },
  statRow: { flexDirection: 'row' },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { color: colors.textPrimary, fontSize: font.xxl, fontWeight: '800', lineHeight: 34 },
  statLabel: { color: colors.textTertiary, fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  quotes: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.xs },

  // ── Completion prompt ───────────────────────────────────────────────
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.68)',
    alignItems: 'center', justifyContent: 'center', padding: spacing.lg,
  },
  modalCard: {
    width: '100%', maxWidth: 420,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.lg,
    alignItems: 'center', gap: spacing.sm, ...shadow.md,
  },
  modalIcon: {
    width: 54, height: 54, borderRadius: radius.full,
    backgroundColor: colors.success + '1E',
    alignItems: 'center', justifyContent: 'center',
  },
  modalTitle: { color: colors.textPrimary, fontSize: font.xl, fontWeight: '800', textAlign: 'center' },
  modalBody: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'center', fontStyle: 'italic' },
  modalAsk: { color: colors.textPrimary, fontSize: font.sm, lineHeight: 21, textAlign: 'center', marginTop: spacing.xs },
  modalWarn: { color: colors.textTertiary, fontSize: font.xs, lineHeight: 17, textAlign: 'center' },
  keepWrap: { width: '100%', borderRadius: radius.md, marginTop: spacing.sm },
  keepBtn: { borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  keepText: { color: '#FFF', fontSize: font.md, fontWeight: '800' },
  dangerBtn: {
    width: '100%', borderRadius: radius.md, paddingVertical: spacing.sm + 4,
    alignItems: 'center', justifyContent: 'center', minHeight: 44,
    borderWidth: 1, borderColor: colors.danger + '55',
  },
  dangerText: { color: colors.danger, fontSize: font.sm, fontWeight: '700' },

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

  rowDone: { borderColor: colors.success + '55' },
  burst: {
    position: 'absolute', top: 1, left: 0,
    width: 21, height: 21, borderRadius: radius.full,
    borderWidth: 2, borderColor: colors.success,
  },
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
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm,
    backgroundColor: colors.background,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  addWrap: { flex: 1, borderRadius: radius.md, ...shadow.glow },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    borderRadius: radius.md, height: 50,
  },
  addText: { color: '#FFF', fontSize: font.md, fontWeight: '800' },
}));
