import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, Image, ScrollView, StyleSheet,
  ActivityIndicator, Alert, Platform, TextInput, Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation, useFocusEffect } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Icon } from '../../components/Icon';
import { MascotLoader } from '../../components/MascotLoader';
import { api, Reel, Task, TaskListResponse, ItineraryResponse, Usage, ReelTodo, thumbUrl } from '../../services/api';
import { formatDue } from '../../services/todoDates';
import { TODO_ADD_LABEL, TODO_ADDED_LABEL } from '../../constants/todoBrand';
import { useWaitingMessage } from '../../constants/waitingMessages';
import { openSourceLink } from '../../services/openLink';
import { getCachedUsage, refreshUsage, onUsage } from '../../services/usageCache';
import { resumesAtSentence } from '../../services/quotaReset';
import { useDismissOnBackground } from '../../services/uiBus';
import { markDeleted, unmarkDeleted, patchReel } from '../../services/libraryEdits';
import * as haptics from '../../services/haptics';
import { Pressable } from '../../components/Pressable';
import { goHome } from '../../components/HomeButton';
import { TaskList } from '../../components/TaskList';
import { TodoEditor } from '../../components/TodoEditor';
import { Disclaimer } from '../../components/Disclaimer';
import { TAB_BAR_CLEARANCE } from '../../components/TabBar';
import { colors, spacing, font, radius, gradients, shadow, typeface, tracking, onImage, platformMeta, categoryFor, categoryMeta, CATEGORY_OPTIONS, themed } from '../../constants/theme';

export default function ReelDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const [reel, setReel] = useState<Reel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [resummarizing, setResummarizing] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [taskList, setTaskList] = useState<TaskListResponse | null>(null);
  const [generatingTasks, setGeneratingTasks] = useState(false);
  // "Add to Follow Through" — no AI, no quota; just copies this save onto the
  // user's list. The button deactivates while an incomplete task is outstanding
  // (server is the source of truth, so completing it elsewhere frees it here).
  const [todoOpen, setTodoOpen] = useState(false);
  const [reelTodo, setReelTodo] = useState<ReelTodo | null>(null);
  const [taskError, setTaskError] = useState('');
  const [hasWorkout, setHasWorkout] = useState(false);
  const [generatingWorkout, setGeneratingWorkout] = useState(false);
  const [itin, setItin] = useState<ItineraryResponse | null>(null);
  const [generatingItin, setGeneratingItin] = useState(false);
  const [itinError, setItinError] = useState('');
  // Rotating "still working" copy — an AI action takes 3-10s and a static
  // "Planning…" reads as a hang. MUST live up here with the other hooks: this
  // component early-returns for the loading/error/missing-reel states further
  // down, so calling these below that point would break the rules of hooks.
  const isCookingReel = (reel?.category || '').toLowerCase() === 'cooking';
  const itinWaiting = useWaitingMessage(generatingItin, 'itinerary');
  const workoutWaiting = useWaitingMessage(generatingWorkout, 'workout');
  const tasksWaiting = useWaitingMessage(generatingTasks, isCookingReel ? 'recipe' : 'tasks');
  // Drives the locked-Pro button states. The server enforces the gates with
  // 403s regardless — this only decides what the button LOOKS like, so a failed
  // fetch just falls back to the normal (unlocked) rendering.
  // Seeded from the login-time fetch. This one decides whether the AI buttons
  // render as locked-PRO or normal, so an empty first frame meant a paid user
  // could watch their buttons flip state under them.
  const [usage, setUsage] = useState<Usage | null>(getCachedUsage);
  const [categoryModal, setCategoryModal] = useState(false);
  // Shown before the FIRST workout generation: sets expectations that the plan
  // is a generic template, not personalized coaching.
  const [workoutModal, setWorkoutModal] = useState(false);
  // Web ghost-click guard: a double-click's second click (or a stray tap) lands
  // on the just-mounted overlay and closed the modal instantly. Overlay presses
  // within 350ms of opening are ignored; card presses never dismiss (see
  // stopPropagation on the card pressables).
  const modalOpenedAt = useRef(0);

  /**
   * Leaving the app closes every sheet this screen owns (owner report,
   * 2026-08-14: share a reel from Instagram, come back, the New-task sheet or
   * the category picker is still sitting there).
   *
   * Each `visible` flag is a `useState` private to this screen, so there is no
   * way to reach them from the root — one subscription per owner is the
   * irreducible part. See services/uiBus.ts.
   */
  useDismissOnBackground(() => {
    setTodoOpen(false);
    setCategoryModal(false);
    setWorkoutModal(false);
  });
  const openModal = (setter: (v: boolean) => void) => {
    modalOpenedAt.current = Date.now();
    setter(true);
  };
  const dismissModal = (setter: (v: boolean) => void) => {
    if (Date.now() - modalOpenedAt.current < 350) return;
    setter(false);
  };
  const [savingCategory, setSavingCategory] = useState(false);
  // Transient "Copied ✓" feedback on the hero copy-link chip.
  const [copied, setCopied] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load the reel; any failure (offline, server down) is caught and shown as a
  // retryable message instead of bubbling up as an uncaught "Failed to fetch".
  const loadReel = useCallback(() => {
    setLoading(true);
    setError('');
    api.getReel(id)
      .then(data => { setReel(data); setNotes(data.notes ?? ''); })
      .catch(() => setError("Couldn't load this reel. Check your connection or that the server is running, then retry."))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    loadReel();
    navigation.setOptions({ title: '' });
    api.getTasks(id).then(setTaskList).catch(() => {});
    api.getWorkout(id).then((plan) => setHasWorkout(plan.exercises.length > 0)).catch(() => {});
    api.getItinerary(id).then(setItin).catch(() => {});
    refreshUsage().then(u => { if (u) setUsage(u); });
  }, [id]);

  /**
   * This screen is where the AI budget is actually SPENT — summarize,
   * re-summarize, tasks, workout, itinerary all live here — and it read the
   * budget once, on mount. So the meter still showed the pre-spend number after
   * five actions, and the hamburger inherited that same stale cache. Every
   * write refreshes the cache now (see api.ts); this makes the screen show it.
   */
  useEffect(() => onUsage(setUsage), []);

  // Refetched on FOCUS, not just mount: the task can be completed (or deleted)
  // over on the Follow Through screen, and coming back here must show the
  // button re-enabled rather than a stale "already added".
  useFocusEffect(
    useCallback(() => {
      api.getReelTodo(id).then(setReelTodo).catch(() => {});
    }, [id])
  );

  // The summary is generated in the background after save, so poll until it lands.
  // If polling gives up while still pending (server was down longer than the cap),
  // mark it "stalled" so the UI offers a manual retry instead of an endless spinner.
  // (The backend also re-enqueues orphaned pending summaries on restart.)
  const [pendingStalled, setPendingStalled] = useState(false);
  useEffect(() => {
    if (reel?.summary_status !== 'pending') return;
    setPendingStalled(false);
    let tries = 0;
    const timer = setInterval(async () => {
      tries++;
      try {
        const fresh = await api.getReel(id);
        if (fresh.summary_status !== 'pending') { setReel(fresh); clearInterval(timer); return; }
      } catch {}
      if (tries >= 24) { clearInterval(timer); setPendingStalled(true); }   // ~60s cap
    }, 2500);
    return () => clearInterval(timer);
  }, [reel?.summary_status, id]);

  const notify = (msg: string) => {
    if (Platform.OS === 'web') window.alert(msg);
    else Alert.alert('', msg);
  };

  const handleNotesChange = (text: string) => {
    setNotes(text);
    setSaveStatus('idle');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveNotes(text), 1000);
  };

  const handleResummarize = async () => {
    if (!reel) return;
    setResummarizing(true);
    try {
      // Flush any just-typed note first — the 1s auto-save debounce may not have
      // fired yet, so without this the latest notes wouldn't reach the re-summary.
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (notes.trim()) { try { await api.updateNotes(id, notes); } catch {} }
      const updated = await api.resummarize(id);
      setReel(updated);
      haptics.success();
    } catch (e: any) {
      haptics.error();
      let msg = 'Re-summarize failed.';
      if (e?.message) msg = e.message;   // api.ts already extracted the server detail
      notify(msg);
    } finally {
      setResummarizing(false);
    }
  };

  // Run/retry the first summary (pending stuck or failed).
  const handleSummarizeNow = async () => {
    setPendingStalled(false);
    setSummarizing(true);
    try {
      const updated = await api.summarizeReel(id);
      setReel(updated);
    } catch (e: any) {
      let msg = 'Summarize failed.';
      if (e?.message) msg = e.message;   // api.ts already extracted the server detail
      notify(msg);
    } finally {
      setSummarizing(false);
    }
  };

  const saveNotes = async (text: string) => {
    setSaveStatus('saving');
    try {
      await api.updateNotes(id, text);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('idle');
    }
  };

  const handleGenerateTasks = async () => {
    setGeneratingTasks(true);
    setTaskError('');
    try {
      // Make sure any just-typed note is persisted before we generate, so the
      // cooking fallback can infer from the user's intent.
      if (notes.trim()) { try { await api.updateNotes(id, notes); } catch {} }
      const result = await api.generateTasks(id);
      setTaskList(result);
      setReel(prev => prev ? { ...prev, tasks_count: (prev.tasks_count ?? 0) + 1 } : prev);
    } catch (e: any) {
      let msg = isCooking
        ? "Couldn't read a recipe from this content. Try adding the dish name in Notes and tapping again."
        : "Couldn't extract steps from this content.";
      if (e?.message) msg = e.message;   // api.ts already extracted the server detail
      setTaskError(msg);
    } finally {
      setGeneratingTasks(false);
    }
  };

  const handleGenerateItinerary = async () => {
    setGeneratingItin(true);
    setItinError('');
    try {
      // Flush any just-typed note first (same reason as re-summarize): the note
      // can steer the itinerary (e.g. "we only have 3 days").
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (notes.trim()) { try { await api.updateNotes(id, notes); } catch {} }
      const res = await api.generateItinerary(id);
      setItin(res);
      haptics.success();
    } catch (e: any) {
      haptics.error();
      setItinError(e?.message || 'Could not build an itinerary from this reel.');
    } finally {
      setGeneratingItin(false);
    }
  };

  const handleGenerateWorkout = async () => {
    setGeneratingWorkout(true);
    try {
      await api.generateWorkout(id);
      setHasWorkout(true);
      setReel(prev => prev ? { ...prev, workout_count: (prev.workout_count ?? 0) + 1 } : prev);
      router.push(`/workout/${id}`);
    } catch (e: any) {
      let msg = 'Could not extract workout plan.';
      if (e?.message) msg = e.message;   // api.ts already extracted the server detail
      notify(msg);
    } finally {
      setGeneratingWorkout(false);
    }
  };

  /**
   * OPTIMISTIC — the pill changes on tap, the request follows.
   *
   * ⚠️ This was the "tags/categories take ages to update" report. The old
   * version awaited a PATCH before touching any state, so on a cold Render free
   * instance (~50s to wake) the modal sat open with a spinner and the pill did
   * not move — for what is, from the user's side, a label they already chose.
   *
   * The category also drives which AI buttons the screen offers (fitness →
   * workout, travel → itinerary, cooking → recipe), so the whole section below
   * re-renders instantly now instead of after the round-trip.
   *
   * On failure the PREVIOUS value is restored and the error is shown — never a
   * silent revert, which would look like the tap simply did nothing.
   */
  const handleSelectCategory = async (category: string) => {
    if (!reel || category === reel.category) { setCategoryModal(false); return; }
    const previous = reel.category;
    setCategoryModal(false);
    setReel(prev => (prev ? { ...prev, category } : prev));
    setSavingCategory(true);
    haptics.tap();
    try {
      const updated = await api.updateCategory(id, category);
      setReel(updated);
      /**
       * ⚠️ TELL THE LIBRARY TOO. This screen was optimistic, the GRID was not:
       * the card behind you still showed the category you just replaced until
       * its own refetch landed — which is the "tags don't update on saved
       * cards" report. The patch is applied to the next server list and retires
       * itself once the server agrees (services/libraryEdits.ts).
       */
      patchReel(id, { category: updated.category });
    } catch (e: any) {
      setReel(prev => (prev ? { ...prev, category: previous } : prev));
      haptics.error();
      notify(e?.message || 'Could not update category. Your previous one is still set.');
    } finally {
      setSavingCategory(false);
    }
  };

  const handleCopyLink = async () => {
    if (!reel?.url) return;
    try {
      await Clipboard.setStringAsync(reel.url);
      haptics.success();
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      notify("Couldn't copy the link.");
    }
  };

  const handleDelete = async () => {
    /**
     * ⚠️ LEAVE FIRST, DELETE AFTER — this used to `await api.deleteReel(id)`
     * before navigating.
     *
     * Same shape as the category bug fixed on 2026-08-12: the user has already
     * confirmed, so there is nothing left to decide, and on a cold Render free
     * instance (~50 s to wake) they sat looking at the reel they just deleted.
     *
     * `markDeleted` is what makes leaving first SAFE. The library refetches on
     * focus, so without it the card we are deleting comes straight back from a
     * server that has not processed the DELETE yet. On failure the mark is
     * lifted and the row honestly reappears.
     */
    const doDelete = async () => {
      markDeleted(id);
      goHome();
      try {
        await api.deleteReel(id);
      } catch {
        unmarkDeleted(id);
      }
    };
    haptics.warning();
    if (Platform.OS === 'web') {
      if (window.confirm('Remove this saved reel?')) doDelete();
    } else {
      Alert.alert('Delete', 'Remove this saved reel?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  if (loading) return (
    <View style={styles.center}><MascotLoader label="Opening your save" /></View>
  );
  if (error) return (
    <View style={[styles.center, { padding: spacing.xl }]}>
      <Icon name="alert-circle" size={32} color={colors.danger} style={{ marginBottom: spacing.sm }} />
      <Text style={[styles.notFound, { textAlign: 'center' }]}>{error}</Text>
      <Pressable style={[styles.pill, { marginTop: spacing.md }]} onPress={loadReel}>
        <Ionicons name="refresh" size={14} color={colors.accent} />
        <Text style={styles.pillText}>Retry</Text>
      </Pressable>
    </View>
  );
  if (!reel) return (
    <View style={styles.center}><Text style={styles.notFound}>Reel not found.</Text></View>
  );

  const platform = platformMeta[reel.platform] ?? platformMeta.unknown;
  const cat = categoryFor(reel.category);
  const isSummarizing = (reel.summary_status === 'pending' && !pendingStalled) || summarizing;
  const isCooking = (reel.category || '').toLowerCase() === 'cooking';
  const loginWalled = reel.platform === 'linkedin' || reel.platform === 'facebook';
  // Medical/high-stakes content: reference only — no tasks, no workout, show the
  // disclaimer instead. The backend refuses generation for these too; hiding the
  // buttons here just keeps the UI honest.
  const isSensitive = !!reel.is_sensitive;
  // Category-level statutory notices. `medical` (the AI-flagged, action-blocking
  // case) always wins — never stack two safety notices on one summary.
  const category = (reel.category || '').toLowerCase();
  const summaryDisclaimer: 'medical' | 'health' | 'finance' | 'ai' =
    isSensitive ? 'medical'
    : category === 'health' ? 'health'
    : category === 'finance' ? 'finance'
    : 'ai';
  const TASKS_LIMIT = 1;   // tasks/steps are AI-generated once; then edited by hand
  const WORKOUT_LIMIT = 3;
  const workoutLimitReached = (reel.workout_count ?? 0) >= WORKOUT_LIMIT;
  const aiTasksUsed = (reel.tasks_count ?? 0) >= TASKS_LIMIT;
  const hasTasksContent = !!(taskList && taskList.tasks.length > 0);
  const showTasksCard = !!taskList && (hasTasksContent || aiTasksUsed) && !isSensitive;
  // No "Turn into Action" for content with nothing genuinely actionable:
  // entertainment, motivation, news, and anything outside a known category
  // (other/unset). Motivation yields generic filler ("Believe in yourself")
  // rather than steps specific to the reel; news is reporting — there is
  // nothing for the reader to *do*, and inventing steps from a headline is
  // exactly the kind of ungrounded output we don't want. Both are an AI action
  // spent for no value. Recategorizing the reel (e.g. a DIY save stuck in
  // "other" → tech/education) re-enables it.
  const NO_ACTION_CATEGORIES = new Set(['entertainment', 'motivation', 'news', 'other', 'general', '']);
  const actionableCategory = !NO_ACTION_CATEGORIES.has((reel.category || '').toLowerCase());
  // Trip Itinerary — travel reels only (server enforces the category with a 422
  // and Pro-only with a 403; this just decides what to render).
  const isTravel = (reel.category || '').toLowerCase() === 'travel';
  // A category with its own specialised generator does NOT also get the generic
  // "Get Action Steps": fitness → workout, travel → itinerary. Two AI buttons on
  // one card means two charges for overlapping output, and generic steps on a
  // trip reel ("Research flights") are strictly worse than the day plan.
  const showTasksAction = actionableCategory && reel.category !== 'fitness' && !isTravel && !aiTasksUsed;
  const showActionsSection = (reel.category === 'fitness' || showTasksAction) && !isSensitive;
  const itinerary = itin?.itinerary ?? null;
  // Pro locks. Lock ONLY when the server EXPLICITLY says a flag is false. A
  // missing flag — still loading, OR a backend that predates the flag — must read
  // as unlocked, or a paid user flashes a spurious PRO lock the moment `usage`
  // resolves without that field. The server's 403 is the real gate either way.
  const feat = usage?.features;
  const itineraryLocked = feat?.itinerary === false;
  const workoutLocked = feat?.workout === false;
  // The "action" button is Recipe on cooking reels, generic tasks elsewhere —
  // each has its own flag.
  const actionLocked = isCooking ? feat?.recipe === false : feat?.tasks === false;
  /** Budget is back after a `quota_exceeded` save. `> 0`, not "the clock says
   *  the reset passed": the server's own count is the thing that decides
   *  whether the retry can succeed, and a cached-but-stale meter only ever
   *  hides the button, which is the safe direction. */
  const aiBackNow = (usage?.remaining ?? 0) > 0;
  const PRO_HINT = 'Available on Pro. Your free plan keeps saves, summaries and search.';
  const itinRegensLeft = itin?.regenerations_left ?? 3;
  const showItinerarySection = isTravel && !isSensitive;

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* ── Hero — tap opens the original reel ───────── */}
      <Pressable style={styles.hero} onPress={() => openSourceLink(reel.url)} scaleTo={0.99}>
        {reel.thumbnail_url ? (
          <Image source={{ uri: thumbUrl(reel.thumbnail_url) }} style={styles.heroImg} resizeMode="cover" />
        ) : (
          <LinearGradient colors={platform.gradient} style={styles.heroImg}>
            <Icon name="play" size={44} color="rgba(255,255,255,0.9)" />
          </LinearGradient>
        )}
        <LinearGradient colors={gradients.scrim} style={styles.heroScrim} />

        {/* Platform is a WORDMARK, not a coloured badge — `platform.color` is
            now the ink tone for every platform (see constants/theme.ts), so a
            filled chip would be a white block on the photo. */}
        <View style={styles.platformChip}>
          <Ionicons name={platform.icon as any} size={12} color={onImage.primary} />
          <Text style={styles.platformChipText}>{platform.label.toUpperCase()}</Text>
        </View>
        <View style={styles.heroActions}>
          <View style={styles.watchChip}>
            <Icon name="play" size={11} color={onImage.primary} />
            <Text style={styles.watchChipText}>WATCH</Text>
          </View>
          {/* Real button (Watch is just decoration for the whole-hero tap), so it
              must swallow the press or the hero opens the link instead of copying. */}
          <Pressable
            style={styles.watchChip}
            onPress={(e) => { e?.stopPropagation?.(); handleCopyLink(); }}
            scaleTo={0.94}
            hitSlop={6}
          >
            <Icon name={copied ? 'checkmark' : 'copy'} size={11} color={onImage.primary} />
            <Text style={styles.watchChipText}>{copied ? 'COPIED' : 'COPY'}</Text>
          </Pressable>
        </View>
      </Pressable>

      {/* ── Title + meta ─────────────────────────────── */}
      <View style={styles.titleBlock}>
        <View style={styles.catRow}>
          <Pressable style={[styles.catPill, { borderColor: cat.color + '66' }]} onPress={() => openModal(setCategoryModal)}>
            <Icon name={cat.icon} size={12} color={cat.color} />
            <Text style={[styles.catText, { color: cat.color }]}>{reel.category || 'set category'}</Text>
            {savingCategory ? <ActivityIndicator size="small" color={cat.color} /> : <Icon name="create" size={11} color={colors.textTertiary} />}
          </Pressable>
          {reel.uploader ? (
            <>
              <Text style={styles.dot}>·</Text>
              <Text style={styles.uploader}>@{reel.uploader}</Text>
            </>
          ) : null}
        </View>
        <Text style={styles.title}>
          {reel.title || (reel.summary_status === 'pending' ? 'Fetching details…' : 'Untitled')}
        </Text>
      </View>

      {/* ── Summary card ─────────────────────────────── */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <Icon name="sparkles" size={15} color={colors.accent} />
            <Text style={styles.cardTitle}>Summary</Text>
          </View>
          {/* Only offer Re-summarize when there's no summary yet — once it's
              generated, the header stays clean (it can still be regenerated only
              when empty, e.g. after pasting the post text into Notes). No per-reel
              retry cap: each run draws from the daily AI quota instead. */}
          {reel.summary.length === 0 && !isSummarizing && (
            <Pressable
              style={styles.pill}
              onPress={handleResummarize}
              disabled={resummarizing}
            >
              {resummarizing ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Ionicons name="refresh" size={13} color={colors.accent} />
              )}
              <Text style={styles.pillText}>
                {resummarizing ? 'Re-summarizing…' : 'Re-summarize'}
              </Text>
            </Pressable>
          )}
        </View>

        {isSummarizing ? (
          <View style={styles.emptySummary}>
            {/* The face, not a spinner — this is the longest wait in the app
                (a cold backend plus a Claude call) and the one most worth
                making feel like the app is still with you. */}
            <MascotLoader label="Reading this one for you" />
            <Text style={styles.emptyTitle}>Summarizing…</Text>
            <Text style={styles.emptyHint}>Reading the content and writing your summary. This card is already saved — feel free to leave; it'll be ready when you come back.</Text>
          </View>
        ) : reel.summary.length > 0 ? (
          <>
            {reel.summary.map((point, i) => (
              <View key={i} style={styles.bulletRow}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>{point}</Text>
              </View>
            ))}
            {/* One notice only, strongest first: flagged-medical > health >
                finance > the generic AI caveat. Stacking two would dilute both. */}
            <Disclaimer variant={summaryDisclaimer} style={{ marginTop: spacing.sm }} />
          </>
        ) : reel.summary_status === 'quota_exceeded' ? (
          /* Out of AI actions when this was saved. The save itself is complete
             and the screen says so first — the card is the product, the summary
             is an enhancement.

             ⚠️ THE BUTTON APPEARS AGAIN ONCE THE BUDGET IS ACTUALLY BACK.
             There was no Try again here at all, on the reasoning that nothing
             could succeed until the reset — true on the day, and wrong every
             day after. Nothing retries a `quota_exceeded` reel automatically
             (startup recovery only picks up rows still `pending`, deliberately
             — see backend/app/routes/reels.py), so this state was a dead end:
             the card said "resumes tomorrow" forever and offered no way to
             make tomorrow happen. Gated on the live `remaining` rather than on
             a clock, so it is the budget itself that decides. */
          <View style={styles.emptySummary}>
            <Icon name="time" size={28} color={colors.textSecondary} style={{ marginBottom: spacing.xs }} />
            <Text style={styles.emptyTitle}>
              {aiBackNow ? 'Saved — your AI actions are back' : 'Saved — AI summary is waiting on your daily reset'}
            </Text>
            <Text style={styles.emptyHint}>
              {aiBackNow
                ? "This one was saved while today's AI actions were used up, so it never got a summary. You have actions again — run it now."
                : "You've used today's AI actions, so this one was saved without a summary. Nothing was lost: the link, title and thumbnail are here, and you can add notes now."}
            </Text>
            {aiBackNow ? (
              <Pressable style={[styles.pill, { marginTop: spacing.sm }]} onPress={handleSummarizeNow} disabled={summarizing}>
                {summarizing ? <ActivityIndicator size="small" color={colors.accent} /> : <Ionicons name="refresh" size={13} color={colors.accent} />}
                <Text style={styles.pillText}>{summarizing ? 'Summarizing…' : 'Summarize now'}</Text>
              </Pressable>
            ) : null}
            <Text style={styles.quotaNote}>
              {aiBackNow
                ? 'Uses 1 AI action from your daily quota.'
                : `${resumesAtSentence(usage?.resets_at)} Your saves are never rationed — only the AI actions are.`}
            </Text>
          </View>
        ) : (reel.summary_status === 'failed' || pendingStalled) ? (
          <View style={styles.emptySummary}>
            <Icon name="alert-circle" size={28} color={colors.danger} style={{ marginBottom: spacing.xs }} />
            <Text style={styles.emptyTitle}>{pendingStalled ? 'Still summarizing…' : "Summary didn't finish"}</Text>
            <Text style={styles.emptyHint}>
              {pendingStalled
                ? 'This is taking longer than usual. Your card is saved — tap to run the summary now.'
                : 'Something interrupted the AI summary. Your card is saved — tap to try again.'}
            </Text>
            <Pressable style={[styles.pill, { marginTop: spacing.sm }]} onPress={handleSummarizeNow} disabled={summarizing}>
              {summarizing ? <ActivityIndicator size="small" color={colors.accent} /> : <Ionicons name="refresh" size={13} color={colors.accent} />}
              <Text style={styles.pillText}>{summarizing ? 'Summarizing…' : 'Try again'}</Text>
            </Pressable>
            <Text style={styles.quotaNote}>Uses 1 AI action from your daily quota — your tier sets the cap.</Text>
          </View>
        ) : (
          <View style={styles.emptySummary}>
            <Icon name={loginWalled ? 'lock' : 'eye'} size={28} color={colors.textSecondary} style={{ marginBottom: spacing.xs }} />
            <Text style={styles.emptyTitle}>
              {loginWalled
                ? `${platform.label} requires login — we couldn't read this automatically`
                : 'We couldn\'t read the text in this reel yet'}
            </Text>
            <Text style={styles.emptyHint}>
              {loginWalled
                ? 'Paste the post text into Notes below, then tap Re-summarize to generate a summary.'
                : 'This reel uses on-screen text or visuals with no speech or description — we can\'t extract that yet. Paste the text in Notes and tap Re-summarize.'}
            </Text>
            <Text style={styles.quotaNote}>Each re-summarize uses 1 AI action from your daily quota — your tier sets the cap.</Text>
          </View>
        )}
      </View>

      {/* ── Tags ─────────────────────────────────────── */}
      {reel.tags.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Icon name="pricetags" size={15} color={colors.accent} />
            <Text style={styles.cardTitle}>Tags</Text>
          </View>
          <View style={styles.tags}>
            {reel.tags.map(tag => (
              <View key={tag} style={styles.tag}><Text style={styles.tagText}>#{tag}</Text></View>
            ))}
          </View>
        </View>
      )}

      {/* ── Notes ────────────────────────────────────── */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <Icon name="create" size={15} color={colors.accent} />
            <Text style={styles.cardTitle}>Your Notes</Text>
          </View>
          {saveStatus === 'saving' && <Text style={styles.saveStatus}>Saving…</Text>}
          {saveStatus === 'saved' && <Text style={[styles.saveStatus, { color: colors.success }]}>Saved ✓</Text>}
        </View>
        <TextInput
          style={styles.notesInput}
          placeholder={
            loginWalled && reel.summary.length === 0
              ? `Paste the ${platform.label} post text here, then tap Re-summarize above…`
              : 'Add your notes, key takeaways, or reminders…'
          }
          placeholderTextColor={colors.textSecondary}
          value={notes}
          onChangeText={handleNotesChange}
          multiline
          textAlignVertical="top"
        />
      </View>

      {/* ── Add to Follow Through ────────────────────────
          Above the AI sections on purpose: it's free, instant, and works on
          every save — including the ones nothing can be generated from.
          Deactivates while a task is outstanding so one save can't spawn a pile
          of duplicate entries; completing it re-enables this automatically. */}
      <View style={styles.card}>
        {reelTodo?.open_todo ? (
          <Pressable style={styles.todoDoneRow} onPress={() => router.push('/todos')} scaleTo={0.98}>
            <Icon name="checkbox" size={16} color={colors.success} />
            <View style={{ flex: 1 }}>
              <Text style={styles.todoDoneText}>{TODO_ADDED_LABEL}</Text>
              <Text style={styles.todoAddSub}>
                Due {formatDue(reelTodo.open_todo.due_date).toLowerCase()} · complete it to add another
              </Text>
            </View>
            <Text style={styles.todoDoneLink}>View</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.todoAddRow} onPress={() => setTodoOpen(true)} scaleTo={0.98}>
            <View style={styles.todoAddIcon}>
              <Icon name="add" size={16} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{TODO_ADD_LABEL}</Text>
              <Text style={styles.todoAddSub}>
                {reelTodo && reelTodo.completed_count > 0
                  ? `Done ${reelTodo.completed_count}× already — add it again?`
                  : "Give this save a day, and it'll come find you."}
              </Text>
            </View>
            <Icon name="chevron-right" size={15} color={colors.textTertiary} />
          </Pressable>
        )}
      </View>

      <TodoEditor
        visible={todoOpen}
        reelId={id}
        defaultTitle={reel.title || 'Saved reel'}
        defaultDescription={reel.summary?.join('\n') || ''}
        onClose={() => setTodoOpen(false)}
        /* ⚠️ The FAST PATH was supported by TodoEditor all along and simply
           never wired up here, so "Add to your slate" from a reel sat on a
           spinner for the whole round-trip while the to-do screen's own New
           Task button returned instantly. Same sheet, two different speeds,
           for no reason. The sheet now closes immediately and the row is
           written behind it. */
        onOptimistic={(draft) => setReelTodo(prev => ({
          reel_id: id,
          open_todo: draft,
          completed_count: prev?.completed_count ?? 0,
        }))}
        onFailed={(_draftId, message) => {
          // Take the optimistic row back out and say why — never a silent revert.
          setReelTodo(prev => (prev ? { ...prev, open_todo: null } : prev));
          notify(message);
        }}
        onSaved={(t) => setReelTodo(prev => ({
          reel_id: id,
          open_todo: t,
          completed_count: prev?.completed_count ?? 0,
        }))}
      />

      {/* ── Trip Itinerary (travel reels) ─────────────── */}
      {showItinerarySection && (
        <View style={styles.actionsSection}>
          <View style={styles.cardTitleRow}>
            <Icon name="travel" size={15} color={colors.warning} />
            <Text style={styles.cardTitle}>Trip Itinerary</Text>
          </View>

          {!itinerary && itineraryLocked && (
            <>
              <View style={styles.lockedBtn}>
                <Icon name="lock-closed" size={18} color={colors.textTertiary} />
                <Text style={styles.lockedBtnText}>Create Itinerary</Text>
                <View style={styles.proTag}><Text style={styles.proTagText}>PRO</Text></View>
              </View>
              <Text style={styles.actionHint}>{PRO_HINT}</Text>
            </>
          )}

          {!itinerary && !itineraryLocked && (
            <>
              <Pressable
                style={styles.actionBtnWrap}
                onPress={handleGenerateItinerary}
                disabled={generatingItin || itinRegensLeft <= 0}
              >
                <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.actionBtn}>
                  {generatingItin
                    ? <ActivityIndicator size="small" color={colors.onAction} />
                    : <Icon name="travel" size={20} color={colors.onAction} />}
                  {/* ⚠️ THE WAITING COPY IS ON THE BUTTON (owner, 2026-08-12).
                      It used to be a bare "Planning…" here with the rotating
                      sentence animating in the small grey hint BELOW — so the
                      thing you were told to read was the furthest, faintest
                      text on screen while the button itself said nothing. */}
                  <Text
                    style={[styles.actionBtnText, generatingItin && styles.actionBtnWorking]}
                    numberOfLines={2}
                  >
                    {generatingItin
                      ? (itinWaiting ?? 'Planning…')
                      : itinRegensLeft <= 0 ? 'Limit reached' : 'Create Itinerary'}
                  </Text>
                </LinearGradient>
              </Pressable>
              {/* Standing explainer only — never the waiting copy, which would
                  now be on screen twice. */}
              {!generatingItin && (
                <Text style={styles.actionHint}>
                  Uses what the reel mentions, then fills the plan in with known highlights of the
                  destination. Prices and opening hours are never guessed — check those yourself.
                  Uses 1 AI action.
                </Text>
              )}
            </>
          )}

          {itinerary && (
            <View style={styles.card}>
              <Text style={styles.itinTripName}>
                {itinerary.trip_name}
                {itinerary.destination ? ` · ${itinerary.destination}` : ''}
                {itinerary.duration_days ? ` · ${itinerary.duration_days} day${itinerary.duration_days > 1 ? 's' : ''}` : ''}
              </Text>
              {itinerary.structure_estimated && (
                <View style={styles.disclaimer}>
                  <Icon name="information-circle" size={14} color={colors.warning} />
                  <Text style={styles.disclaimerText}>
                    The reel didn't state a day-by-day plan, so the days were organized by AI — and anything the reel didn't name was added from general knowledge of the destination. Double-check opening times and prices before you go.
                  </Text>
                </View>
              )}
              {itinerary.days.map((day, di) => (
                <View key={di} style={styles.itinDay}>
                  <Text style={styles.itinDayLabel}>{day.label}</Text>
                  {day.items.map((it, ii) => (
                    <View key={ii} style={styles.itinItemRow}>
                      <Text style={styles.itinEmoji}>{it.emoji}</Text>
                      <Text style={styles.itinItemText}>{it.text}</Text>
                    </View>
                  ))}
                </View>
              ))}
              {itinerary.tips.length > 0 && (
                <View style={styles.itinDay}>
                  <Text style={styles.itinDayLabel}>Tips</Text>
                  {itinerary.tips.map((t, i) => (
                    <View key={i} style={styles.itinItemRow}>
                      <Text style={styles.itinEmoji}>💡</Text>
                      <Text style={styles.itinItemText}>{t}</Text>
                    </View>
                  ))}
                </View>
              )}
              {/* Rebuild removed (2026-07-24): regenerating spent an AI action to
                  produce a near-identical plan from the same source text, and the
                  "(N left)" counter made the cost the user's problem. First
                  generation still works; the server-side cap stays as the guard. */}
            </View>
          )}

          {itinError ? (
            <View style={styles.inlineError}>
              <Icon name="alert-circle" size={14} color={colors.danger} />
              <Text style={styles.inlineErrorText}>{itinError}</Text>
            </View>
          ) : null}
        </View>
      )}

      {/* ── Actions ──────────────────────────────────── */}
      {showActionsSection && (
        <View style={styles.actionsSection}>
          <View style={styles.cardTitleRow}>
            <Icon name="flash" size={15} color={colors.warning} />
            <Text style={styles.cardTitle}>Turn into Action</Text>
          </View>
          <View style={styles.actionRow}>
            {/* Build is Pro-gated; VIEWING a plan generated during trial stays free. */}
            {reel.category === 'fitness' && (
              workoutLocked && !hasWorkout ? (
                <View style={styles.lockedBtn}>
                  <Icon name="lock-closed" size={18} color={colors.textTertiary} />
                  <Text style={styles.lockedBtnText}>Build Workout</Text>
                  <View style={styles.proTag}><Text style={styles.proTagText}>PRO</Text></View>
                </View>
              ) : (
                <Pressable
                  style={styles.actionBtnWrap}
                  onPress={hasWorkout ? () => router.push(`/workout/${id}`) : () => openModal(setWorkoutModal)}
                  disabled={generatingWorkout || (!hasWorkout && workoutLimitReached)}
                >
                  <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.actionBtn}>
                    {generatingWorkout
                      ? <ActivityIndicator size="small" color={colors.onAction} />
                      : <Icon name="barbell" size={20} color={colors.onAction} />}
                    <Text
                      style={[styles.actionBtnText, generatingWorkout && styles.actionBtnWorking]}
                      numberOfLines={2}
                    >
                      {generatingWorkout
                        ? (workoutWaiting ?? 'Building…')
                        : hasWorkout ? 'View Workout' : workoutLimitReached ? 'Limit reached' : 'Build Workout'}
                    </Text>
                  </LinearGradient>
                </Pressable>
              )
            )}

            {showTasksAction && actionLocked && (
              <View style={styles.lockedBtn}>
                <Icon name="lock-closed" size={18} color={colors.textTertiary} />
                <Text style={styles.lockedBtnText}>{isCooking ? 'Get Recipe' : 'Get Action Steps'}</Text>
                <View style={styles.proTag}><Text style={styles.proTagText}>PRO</Text></View>
              </View>
            )}

            {showTasksAction && !actionLocked && (
              <Pressable style={styles.actionBtnWrap} onPress={handleGenerateTasks} disabled={generatingTasks}>
                <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.actionBtn}>
                  {generatingTasks
                    ? <ActivityIndicator size="small" color={colors.onAction} />
                    : <Icon name={isCooking ? 'restaurant' : 'list'} size={20} color={colors.onAction} />}
                  <Text
                    style={[styles.actionBtnText, generatingTasks && styles.actionBtnWorking]}
                    numberOfLines={2}
                  >
                    {generatingTasks
                      ? (tasksWaiting ?? 'Working…')
                      : (isCooking ? 'Get Recipe' : 'Get Action Steps')}
                  </Text>
                </LinearGradient>
              </Pressable>
            )}
          </View>
          {/* Both waiting messages moved ONTO their buttons above. What is left
              here is the standing explainer, hidden while generating so the
              same sentence never appears twice. */}
          {showTasksAction && !generatingTasks && (
            <Text style={styles.actionHint}>
              {actionLocked ? PRO_HINT : 'Generated once with AI — after that you can add, edit, or delete by hand.'}
            </Text>
          )}
          {taskError ? (
            <View style={styles.inlineError}>
              <Icon name="alert-circle" size={14} color={colors.danger} />
              <Text style={styles.inlineErrorText}>{taskError}</Text>
            </View>
          ) : null}
        </View>
      )}

      {/* ── Tasks ────────────────────────────────────── */}
      {showTasksCard && taskList && (
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Icon name={isCooking ? 'restaurant' : taskList.kind === 'steps' ? 'footsteps' : 'list'} size={15} color={colors.accent} />
            <Text style={styles.cardTitle}>{isCooking ? 'Recipe' : taskList.kind === 'steps' ? 'Steps' : 'Tasks'}</Text>
          </View>
          {/* ⚠️ ONE notice, not two. `taskList.note` was rendered here AND
              again below the disclaimers, so an inferred recipe showed
              "couldn't read this video…" twice in the same card. The copy is
              the server's (`_source_note`), so the fix is to render it once —
              kept at the LOWER site, immediately above the steps it qualifies. */}
          {/* Steps are the riskiest surface for these categories — this is where
              content becomes a checklist someone might actually follow. */}
          {category === 'health' && <Disclaimer variant="health" style={{ marginTop: spacing.sm }} />}
          {category === 'finance' && <Disclaimer variant="finance" style={{ marginTop: spacing.sm }} />}
          {isCooking && <Disclaimer variant="recipe" style={{ marginTop: spacing.sm }} />}
          {/* The backend has always computed this disclaimer (_source_note: the
              steps were inferred from the title or your note because the reel
              itself couldn't be read) and shipped it on TaskListResponse.note —
              nothing ever rendered it. That distinction matters more now the
              prompts fill gaps from general knowledge, so surface the server's
              own wording rather than a second copy that can drift from it. */}
          {taskList?.note && taskList.tasks.length > 0 && (
            <View style={styles.disclaimer}>
              <Icon name="information-circle" size={14} color={colors.warning} />
              <Text style={styles.disclaimerText}>{taskList.note}</Text>
            </View>
          )}
          <View style={{ marginTop: spacing.sm }}>
            <TaskList
              tasks={taskList.tasks}
              reelId={id}
              kind={taskList.kind}
              onUpdate={updated => setTaskList(prev => prev ? {
                ...prev,
                tasks: prev.tasks.map(t => t.id === updated.id ? updated : t),
              } : prev)}
              /* `replaces` swaps the optimistic draft row for the server's,
                 instead of leaving both. Filtering by BOTH ids also makes this
                 idempotent — re-adding a row that is somehow already present
                 cannot duplicate it. */
              onAdd={(created, replaces) => setTaskList(prev => prev ? {
                ...prev,
                total: prev.tasks.filter(t => t.id !== created.id && t.id !== replaces).length + 1,
                tasks: [...prev.tasks.filter(t => t.id !== created.id && t.id !== replaces), created],
              } : prev)}
              onDelete={delId => setTaskList(prev => prev ? {
                ...prev,
                total: Math.max(0, prev.tasks.length - 1),
                tasks: prev.tasks.filter(t => t.id !== delId),
              } : prev)}
            />
          </View>
        </View>
      )}

      {/* ── Delete ───────────────────────────────────── */}
      <Pressable style={styles.deleteButton} onPress={handleDelete}>
        <Icon name="trash-outline" size={16} color={colors.danger} />
        <Text style={styles.deleteText}>Delete</Text>
      </Pressable>
      </ScrollView>

      {/* Expectation-setting before the first workout build: generic template,
          not personalized coaching — beginners adapt at their own pace. */}
      <Modal visible={workoutModal} transparent animationType="fade" onRequestClose={() => setWorkoutModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => dismissModal(setWorkoutModal)} scaleTo={1}>
          {/* Card swallows its own presses so reading/clicking inside never
              bubbles up to the close-on-press overlay (react-native-web). */}
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()} scaleTo={1}>
            <View style={styles.cardTitleRow}>
              <Icon name="barbell" size={16} color={colors.warning} />
              <Text style={styles.modalTitle}>A starting template — not a coaching plan</Text>
            </View>
            <Text style={styles.modalBody}>
              This builds a general workout inspired by the reel, not a plan tailored to you.
              If you're a beginner, start lighter and move at your own pace — you can edit
              every set, rep and rest time after it's built.
            </Text>
            <Disclaimer variant="fitness" />
            <View style={styles.modalBtnRow}>
              <Pressable style={styles.modalBtnGhost} onPress={() => setWorkoutModal(false)}>
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.modalBtnWrap}
                onPress={() => { setWorkoutModal(false); handleGenerateWorkout(); }}
              >
                <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.modalBtn}>
                  <Text style={styles.modalBtnText}>Got it — build it</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={categoryModal} transparent animationType="fade" onRequestClose={() => setCategoryModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => dismissModal(setCategoryModal)} scaleTo={1}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()} scaleTo={1}>
            <Text style={styles.modalTitle}>Choose a category</Text>
            <Text style={styles.modalHint}>Pick one — it replaces the auto-assigned category.</Text>
            <View style={styles.catGrid}>
              {CATEGORY_OPTIONS.map(c => {
                const m = categoryMeta[c];
                const active = reel.category === c;
                return (
                  <Pressable
                    key={c}
                    style={[styles.catOption, active && { backgroundColor: m.color, borderColor: m.color }]}
                    onPress={() => handleSelectCategory(c)}
                  >
                    <Icon name={m.icon} size={15} color={active ? colors.onAction : m.color} emphasis={active} />
                    <Text style={[styles.catOptionText, active && styles.catOptionTextActive]}>{c}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, backgroundColor: 'transparent' },
  content: { padding: spacing.md, paddingBottom: TAB_BAR_CLEARANCE + spacing.xl, gap: spacing.md, maxWidth: 720, width: '100%', alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  notFound: { color: colors.textSecondary, fontSize: font.md },

  // The hero is a full-bleed frame with a hairline seam — no radius, no shadow.
  hero: { overflow: 'hidden', borderWidth: 1, borderColor: colors.ghostLine },
  heroImg: { width: '100%', height: 300, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  heroScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 110 },
  // ⚠️ Chips on the hero keep a DARK scrim and LIGHT text in both schemes. The
  // photograph underneath does not invert, so these must not either.
  platformChip: {
    position: 'absolute', left: spacing.sm, bottom: spacing.sm,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.sm, paddingVertical: 5,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1, borderColor: 'rgba(248,248,248,0.28)',
  },
  platformChipText: {
    color: onImage.primary, fontFamily: typeface.label,
    fontSize: font.xs, letterSpacing: tracking.labelWide,
  },
  watchChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.sm, paddingVertical: 5,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1, borderColor: 'rgba(248,248,248,0.28)',
  },
  watchChipText: {
    color: onImage.primary, fontFamily: typeface.label,
    fontSize: font.xs, letterSpacing: tracking.labelWide,
  },
  heroActions: {
    position: 'absolute', right: spacing.md, bottom: spacing.md,
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
  },

  titleBlock: { gap: spacing.xs },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  catEmoji: { fontSize: 14 },
  catText: { fontSize: font.xs, fontWeight: '800', textTransform: 'capitalize', letterSpacing: 0.3 },
  dot: { color: colors.textTertiary },
  uploader: { color: colors.textSecondary, fontSize: font.xs },
  catPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: radius.full, borderWidth: 1, backgroundColor: colors.card,
  },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', padding: spacing.lg,
  },
  modalCard: {
    width: '100%', maxWidth: 440,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm,
  },
  modalTitle: { color: colors.textPrimary, fontSize: font.lg, fontWeight: '800', flex: 1, flexWrap: 'wrap' },
  modalHint: { color: colors.textSecondary, fontSize: font.xs, marginBottom: spacing.xs },
  modalBody: { color: colors.textSecondary, fontSize: font.sm, lineHeight: 21 },
  modalBtnRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  modalBtnGhost: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.sm + 4, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  modalBtnGhostText: { color: colors.textSecondary, fontSize: font.sm, fontWeight: '700' },
  modalBtnWrap: { flex: 1.4, borderRadius: radius.md, ...shadow.sm },
  modalBtn: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.sm + 4, borderRadius: radius.md,
  },
  modalBtnText: { color: colors.onAction, fontSize: font.sm, fontWeight: '800' },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  catOption: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.card,
  },
  catOptionEmoji: { fontSize: 15 },
  catOptionText: { color: colors.textSecondary, fontSize: font.sm, fontWeight: '600', textTransform: 'capitalize' },
  catOptionTextActive: { color: colors.onAction, fontWeight: '800' },
  // Light weight at large size with negative tracking — the system's signature
  // display setting. Never bold this; 300 is the whole point.
  title: { color: colors.textPrimary, fontFamily: typeface.display, fontSize: font.xxl, lineHeight: font.xxl * 1.1, letterSpacing: tracking.title },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { color: colors.textPrimary, fontSize: font.sm, fontWeight: '800', letterSpacing: 0.3, textTransform: 'uppercase' },

  // ── Add to to-do ────────────────────────────────────────────────────
  todoAddRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  todoAddIcon: {
    width: 34, height: 34, borderRadius: radius.sm,
    backgroundColor: colors.accent + '1A',
    alignItems: 'center', justifyContent: 'center',
  },
  todoAddSub: { color: colors.textSecondary, fontSize: font.xs, marginTop: 2 },
  todoDoneRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  todoDoneText: { flex: 1, color: colors.textPrimary, fontSize: font.sm, fontWeight: '700' },
  todoDoneLink: { color: colors.accentLight, fontSize: font.sm, fontWeight: '700' },

  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: spacing.sm + 2, paddingVertical: 6,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.accent,
  },
  pillText: { color: colors.accent, fontSize: font.xs, fontWeight: '700' },

  emptySummary: { alignItems: 'center', paddingVertical: spacing.md, gap: spacing.xs },
  emptyEmoji: { fontSize: 30, marginBottom: spacing.xs },
  emptyTitle: { color: colors.textPrimary, fontSize: font.sm, fontWeight: '700', textAlign: 'center' },
  emptyHint: { color: colors.textSecondary, fontSize: font.xs, lineHeight: 18, textAlign: 'center' },
  quotaNote: { color: colors.textTertiary, fontSize: font.xs, lineHeight: 16, textAlign: 'center', marginTop: spacing.xs },

  bulletRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  bulletDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent, marginTop: 7 },
  bulletText: { flex: 1, color: colors.textPrimary, fontSize: font.md, lineHeight: 23 },

  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  tag: { backgroundColor: colors.tagBg, borderRadius: radius.full, paddingHorizontal: spacing.sm + 2, paddingVertical: 6 },
  tagText: { color: colors.tagText, fontSize: font.xs, fontWeight: '600' },

  disclaimer: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: colors.warning + '1A',
    borderRadius: radius.sm, padding: spacing.sm,
  },
  disclaimerText: { flex: 1, color: colors.warning, fontSize: font.xs, lineHeight: 16 },

  saveStatus: { color: colors.textSecondary, fontSize: font.xs },
  notesInput: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    color: colors.textPrimary, fontSize: font.md,
    padding: spacing.md, minHeight: 96, lineHeight: 22,
  },

  actionsSection: { gap: spacing.sm },
  actionRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  actionBtnWrap: { flex: 1, minWidth: 140, borderRadius: radius.md, ...shadow.sm },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    borderRadius: radius.md, paddingVertical: spacing.md,
    // Fixed floor so the button does not JUMP when its label swaps from
    // "Get Recipe" to a two-line waiting message and back.
    minHeight: 58,
  },
  // flexShrink + centre + 2 lines: the waiting copy now lives ON the button
  // (owner, 2026-08-12) and has to be able to wrap inside it rather than
  // overflow the gradient or ellipsize halfway through a sentence.
  actionBtnText: {
    color: colors.onAction, fontSize: font.sm, fontWeight: '800',
    flexShrink: 1, textAlign: 'center',
  },
  // Slightly lighter and leaded for the rotating sentence — it is a full line of
  // prose, not a label, and 800-weight at 12px reads as shouting.
  actionBtnWorking: { fontWeight: '700', lineHeight: 17 },
  actionHint: { color: colors.textTertiary, fontSize: font.xs, lineHeight: 16 },
  inlineError: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs,
    backgroundColor: colors.danger + '18', borderRadius: radius.sm,
    padding: spacing.sm, marginTop: spacing.xs,
  },
  inlineErrorText: { color: colors.danger, fontSize: font.xs, lineHeight: 16, flex: 1 },

  // Locked (Pro) variant of an action button: unmistakably inert — no gradient,
  // dashed border, muted text — so it reads as "not yet yours", not "broken".
  lockedBtn: {
    flex: 1, minWidth: 140,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    borderRadius: radius.md, paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed',
  },
  lockedBtnText: { color: colors.textSecondary, fontSize: font.sm, fontWeight: '800' },
  proTag: {
    backgroundColor: colors.accent + '22', borderRadius: radius.sm,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  proTagText: { color: colors.accent, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },

  itinTripName: {
    color: colors.textPrimary, fontSize: font.md, fontWeight: '800',
    marginBottom: spacing.xs,
  },
  itinDay: { marginTop: spacing.sm },
  itinDayLabel: {
    color: colors.accent, fontSize: font.sm, fontWeight: '800',
    marginBottom: spacing.xs, letterSpacing: 0.3,
  },
  itinItemRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    paddingVertical: 3,
  },
  itinEmoji: { fontSize: font.sm, lineHeight: 20 },
  itinItemText: { flex: 1, color: colors.textPrimary, fontSize: font.sm, lineHeight: 20 },

  deleteButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    paddingVertical: spacing.md, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.danger + '44',
  },
  deleteText: { color: colors.danger, fontSize: font.sm, fontWeight: '700' },
}));
