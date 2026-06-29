import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, Image, ScrollView, StyleSheet,
  ActivityIndicator, Alert, Platform, TextInput, Linking, Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Icon } from '../../components/Icon';
import { api, Reel, Task, TaskListResponse, thumbUrl } from '../../services/api';
import { Pressable } from '../../components/Pressable';
import { goHome } from '../../components/HomeButton';
import { TaskList } from '../../components/TaskList';
import { AuroraBackground } from '../../components/AuroraBackground';
import { colors, spacing, font, radius, gradients, shadow, platformMeta, categoryFor, categoryMeta, CATEGORY_OPTIONS } from '../../constants/theme';

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
  const [hasWorkout, setHasWorkout] = useState(false);
  const [generatingWorkout, setGeneratingWorkout] = useState(false);
  const [categoryModal, setCategoryModal] = useState(false);
  const [savingCategory, setSavingCategory] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const RESUMMARIZE_LIMIT = 3;

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
  }, [id]);

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
    if (!reel || reel.summarize_count >= RESUMMARIZE_LIMIT) return;
    setResummarizing(true);
    try {
      const updated = await api.resummarize(id);
      setReel(updated);
    } catch (e: any) {
      let msg = 'Re-summarize failed.';
      try { msg = JSON.parse(e.message)?.detail ?? e.message; } catch {}
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
      try { msg = JSON.parse(e.message)?.detail ?? e.message; } catch {}
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
    try {
      // Make sure any just-typed note is persisted before we generate, so the
      // cooking fallback can infer from the user's intent.
      if (notes.trim()) { try { await api.updateNotes(id, notes); } catch {} }
      const result = await api.generateTasks(id);
      setTaskList(result);
      setReel(prev => prev ? { ...prev, tasks_count: (prev.tasks_count ?? 0) + 1 } : prev);
    } catch (e: any) {
      let msg = 'Could not extract tasks.';
      try { msg = JSON.parse(e.message)?.detail ?? e.message; } catch {}
      notify(msg);
    } finally {
      setGeneratingTasks(false);
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
      try { msg = JSON.parse(e.message)?.detail ?? e.message; } catch {}
      notify(msg);
    } finally {
      setGeneratingWorkout(false);
    }
  };

  const handleSelectCategory = async (category: string) => {
    if (!reel || category === reel.category) { setCategoryModal(false); return; }
    setSavingCategory(true);
    try {
      const updated = await api.updateCategory(id, category);
      setReel(updated);
    } catch (e: any) {
      let msg = 'Could not update category.';
      try { msg = JSON.parse(e.message)?.detail ?? e.message; } catch {}
      notify(msg);
    } finally {
      setSavingCategory(false);
      setCategoryModal(false);
    }
  };

  const handleDelete = async () => {
    const doDelete = async () => { await api.deleteReel(id); goHome(); };
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
    <View style={styles.center}><ActivityIndicator color={colors.accent} size="large" /></View>
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
  const limitReached = reel.summarize_count >= RESUMMARIZE_LIMIT;
  const isSummarizing = (reel.summary_status === 'pending' && !pendingStalled) || summarizing;
  const isCooking = (reel.category || '').toLowerCase() === 'cooking';
  const loginWalled = reel.platform === 'linkedin' || reel.platform === 'facebook';
  const TASKS_LIMIT = 1;   // tasks/steps are AI-generated once; then edited by hand
  const WORKOUT_LIMIT = 3;
  const workoutLimitReached = (reel.workout_count ?? 0) >= WORKOUT_LIMIT;
  const aiTasksUsed = (reel.tasks_count ?? 0) >= TASKS_LIMIT;
  const hasTasksContent = !!(taskList && taskList.tasks.length > 0);
  const showTasksCard = !!taskList && (hasTasksContent || aiTasksUsed);
  const showTasksAction = reel.category !== 'fitness' && !aiTasksUsed;
  const showActionsSection = reel.category === 'fitness' || showTasksAction;

  return (
    <View style={styles.screen}>
      <AuroraBackground />
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* ── Hero ─────────────────────────────────────── */}
      <View style={styles.hero}>
        {reel.thumbnail_url ? (
          <Image source={{ uri: thumbUrl(reel.thumbnail_url) }} style={styles.heroImg} resizeMode="cover" />
        ) : (
          <LinearGradient colors={platform.gradient} style={styles.heroImg}>
            <Icon name="play" size={44} color="rgba(255,255,255,0.9)" />
          </LinearGradient>
        )}
        <LinearGradient colors={['transparent', 'rgba(11,10,15,0.95)']} style={styles.heroScrim} />

        <View style={[styles.platformChip, { backgroundColor: platform.color }]}>
          <Ionicons name={platform.icon as any} size={13} color="#FFF" />
          <Text style={styles.platformChipText}>{platform.label}</Text>
        </View>
      </View>

      {/* ── Title + meta ─────────────────────────────── */}
      <View style={styles.titleBlock}>
        <View style={styles.catRow}>
          <Pressable style={[styles.catPill, { borderColor: cat.color + '66' }]} onPress={() => setCategoryModal(true)}>
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
        <Text style={styles.title}>{reel.title || 'Untitled'}</Text>
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
              when empty, e.g. after pasting the post text into Notes). */}
          {reel.summary.length === 0 && !isSummarizing && (
            <Pressable
              style={[styles.pill, limitReached && styles.pillDisabled]}
              onPress={handleResummarize}
              disabled={limitReached || resummarizing}
            >
              {resummarizing ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Ionicons
                  name={limitReached ? 'lock-closed' : 'refresh'}
                  size={13}
                  color={limitReached ? colors.textTertiary : colors.accent}
                />
              )}
              <Text style={[styles.pillText, limitReached && styles.pillTextDisabled]}>
                {resummarizing ? 'Re-summarizing…' : limitReached ? 'Limit reached' : `Re-summarize (${RESUMMARIZE_LIMIT - reel.summarize_count} left)`}
              </Text>
            </Pressable>
          )}
        </View>

        {isSummarizing ? (
          <View style={styles.emptySummary}>
            <ActivityIndicator color={colors.accent} style={{ marginBottom: spacing.xs }} />
            <Text style={styles.emptyTitle}>Summarizing…</Text>
            <Text style={styles.emptyHint}>Reading the content and writing your summary. This card is already saved — feel free to leave; it'll be ready when you come back.</Text>
          </View>
        ) : reel.summary.length > 0 ? (
          reel.summary.map((point, i) => (
            <View key={i} style={styles.bulletRow}>
              <View style={styles.bulletDot} />
              <Text style={styles.bulletText}>{point}</Text>
            </View>
          ))
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

      {/* ── Actions ──────────────────────────────────── */}
      {showActionsSection && (
        <View style={styles.actionsSection}>
          <View style={styles.cardTitleRow}>
            <Icon name="flash" size={15} color={colors.warning} />
            <Text style={styles.cardTitle}>Turn into Action</Text>
          </View>
          <View style={styles.actionRow}>
            {reel.category === 'fitness' && (
              <Pressable
                style={styles.actionBtnWrap}
                onPress={hasWorkout ? () => router.push(`/workout/${id}`) : handleGenerateWorkout}
                disabled={generatingWorkout || (!hasWorkout && workoutLimitReached)}
              >
                <LinearGradient colors={gradients.vibrant} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.actionBtn}>
                  {generatingWorkout
                    ? <ActivityIndicator size="small" color="#FFF" />
                    : <Icon name="barbell" size={20} color="#FFF" />}
                  <Text style={styles.actionBtnText}>
                    {generatingWorkout ? 'Building…' : hasWorkout ? 'View Workout' : workoutLimitReached ? 'Limit reached' : 'Build Workout'}
                  </Text>
                </LinearGradient>
              </Pressable>
            )}

            {showTasksAction && (
              <Pressable style={styles.actionBtnWrap} onPress={handleGenerateTasks} disabled={generatingTasks}>
                <LinearGradient colors={gradients.cool} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.actionBtn}>
                  {generatingTasks
                    ? <ActivityIndicator size="small" color="#FFF" />
                    : <Icon name={isCooking ? 'restaurant' : 'list'} size={20} color="#FFF" />}
                  <Text style={styles.actionBtnText}>
                    {generatingTasks ? 'Working…' : (isCooking ? 'Get Recipe' : 'Get Action Steps')}
                  </Text>
                </LinearGradient>
              </Pressable>
            )}
          </View>
          {showTasksAction && (
            <Text style={styles.actionHint}>Generated once with AI — after that you can add, edit, or delete by hand.</Text>
          )}
        </View>
      )}

      {/* ── Tasks ────────────────────────────────────── */}
      {showTasksCard && taskList && (
        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Icon name={isCooking ? 'restaurant' : taskList.kind === 'steps' ? 'footsteps' : 'list'} size={15} color={colors.accent} />
            <Text style={styles.cardTitle}>{isCooking ? 'Recipe' : taskList.kind === 'steps' ? 'Steps' : 'Tasks'}</Text>
          </View>
          {taskList.note ? (
            <View style={styles.disclaimer}>
              <Icon name="information-circle" size={14} color={colors.warning} />
              <Text style={styles.disclaimerText}>{taskList.note}</Text>
            </View>
          ) : null}
          <View style={{ marginTop: spacing.sm }}>
            <TaskList
              tasks={taskList.tasks}
              reelId={id}
              kind={taskList.kind}
              onUpdate={updated => setTaskList(prev => prev ? {
                ...prev,
                tasks: prev.tasks.map(t => t.id === updated.id ? updated : t),
              } : prev)}
              onAdd={created => setTaskList(prev => prev ? {
                ...prev,
                total: prev.tasks.length + 1,
                tasks: [...prev.tasks, created],
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

      {/* ── Source + delete ──────────────────────────── */}
      <Pressable style={styles.urlRow} onPress={() => Linking.openURL(reel.url)}>
        <Icon name="open-outline" size={15} color={colors.accent} />
        <Text style={styles.url} numberOfLines={1}>{reel.url}</Text>
      </Pressable>

      <Pressable style={styles.deleteButton} onPress={handleDelete}>
        <Icon name="trash-outline" size={16} color={colors.danger} />
        <Text style={styles.deleteText}>Delete</Text>
      </Pressable>
      </ScrollView>

      <Modal visible={categoryModal} transparent animationType="fade" onRequestClose={() => setCategoryModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setCategoryModal(false)} scaleTo={1}>
          <View style={styles.modalCard}>
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
                    <Icon name={m.icon} size={15} color={active ? '#FFF' : m.color} />
                    <Text style={[styles.catOptionText, active && styles.catOptionTextActive]}>{c}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, backgroundColor: 'transparent' },
  content: { padding: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  notFound: { color: colors.textSecondary, fontSize: font.md },

  hero: { borderRadius: radius.lg, overflow: 'hidden', ...shadow.md },
  heroImg: { width: '100%', height: 220, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  heroScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 90 },
  platformChip: {
    position: 'absolute', left: spacing.md, bottom: spacing.md,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: spacing.sm + 2, paddingVertical: 5,
    borderRadius: radius.full, ...shadow.sm,
  },
  platformChipText: { color: '#FFF', fontSize: font.xs, fontWeight: '800' },

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
  modalTitle: { color: colors.textPrimary, fontSize: font.lg, fontWeight: '800' },
  modalHint: { color: colors.textSecondary, fontSize: font.xs, marginBottom: spacing.xs },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  catOption: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.card,
  },
  catOptionEmoji: { fontSize: 15 },
  catOptionText: { color: colors.textSecondary, fontSize: font.sm, fontWeight: '600', textTransform: 'capitalize' },
  catOptionTextActive: { color: '#FFF', fontWeight: '800' },
  title: { color: colors.textPrimary, fontSize: font.xl, fontWeight: '800', lineHeight: 30, letterSpacing: -0.5 },

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

  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: spacing.sm + 2, paddingVertical: 6,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.accent,
  },
  pillDisabled: { borderColor: colors.border },
  pillText: { color: colors.accent, fontSize: font.xs, fontWeight: '700' },
  pillTextDisabled: { color: colors.textTertiary },

  emptySummary: { alignItems: 'center', paddingVertical: spacing.md, gap: spacing.xs },
  emptyEmoji: { fontSize: 30, marginBottom: spacing.xs },
  emptyTitle: { color: colors.textPrimary, fontSize: font.sm, fontWeight: '700', textAlign: 'center' },
  emptyHint: { color: colors.textSecondary, fontSize: font.xs, lineHeight: 18, textAlign: 'center' },

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
  },
  actionBtnText: { color: '#FFF', fontSize: font.sm, fontWeight: '800' },
  actionHint: { color: colors.textTertiary, fontSize: font.xs, lineHeight: 16 },

  urlRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md,
  },
  url: { flex: 1, color: colors.textSecondary, fontSize: font.xs },

  deleteButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    paddingVertical: spacing.md, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.danger + '44',
  },
  deleteText: { color: colors.danger, fontSize: font.sm, fontWeight: '700' },
});
