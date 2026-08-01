import { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Modal, Image, Animated } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, thumbUrl, Reel, Todo, TodoStats } from '../services/api';
import { bucketOf, todayISO } from '../services/todoDates';
import { useTodoSettings } from '../services/todoSettings';
import { TodoGoalBar } from './TodoGoalBar';
import { TODO_LANDING_TITLE } from '../constants/todoBrand';
import { Pressable } from './Pressable';
import { Icon } from './Icon';
import { ProfilePanel } from './ProfilePanel';
import { Label, Body, Title, Rule, Index, GhostButton, FilledButton, Wordmark } from './kit';
import { colors, spacing, font, tracking, typeface, themed } from '../constants/theme';
import { useAuth } from '../contexts/AuthContext';
import { consumeReopenPanel } from '../services/sessionFlags';
import { FEATURES, Feature } from '../constants/features';
import { RollingTagline } from './RollingTagline';
import { ASK_MIN_REELS } from '../constants/limits';

// How many saves the home screen shows before handing off to the full library.
const RECENT_LIMIT = 10;
/** Carousel frame width — also the snap interval, so scrolling settles on a frame. */
const RECENT_CARD_W = 138;
/** Only fetch what this screen renders. The landing used to pull 24 reels for a
 *  list it never showed; the carousel needs a fraction of that, and a smaller
 *  payload is the whole reason the home screen now appears faster. */
const LANDING_FETCH = 12;

/** Greeting sub-line for a returning user: a best-case "here's what SaveHere can
 *  do for you" prompt instead of a dead stat. One is picked at random each open
 *  so it feels fresh. Keep them true for the free tier and one line long. */
const GREETING_HELPERS = [
  'Ask your library a question and get an answer from your own saves.',
  'That reel you saved? Its key steps are one tap away.',
  'Turn a saved workout into a plan you can follow along to.',
  'Your travel saves can come together into a trip plan.',
  'Forgot where you saved that tip? Search finds it in seconds.',
  'Every save is summarized, so you can skim it without rewatching.',
  'Your endless scroll, turned into a library you can actually use.',
  'The recipe you saved is ready as step-by-step instructions.',
  'Pick a saved idea and turn it into a checklist you can finish.',
  "Everything you've saved — summarized and searchable in one place.",
];

/**
 * Priority marks for the to-do preview.
 *
 * ⚠️ This used to be a colour map (red / amber / grey). The system is
 * achromatic, so priority is carried by MARK SHAPE instead — filled, hollow,
 * hairline. That is also the accessible version: the old map failed for anyone
 * who can't separate red from amber, which is the single most common form of
 * colour blindness.
 */
const PRIORITY_MARK: Record<string, 'filled' | 'hollow' | 'faint'> = {
  high: 'filled',
  medium: 'hollow',
  low: 'faint',
};

/** One half of the home screen's Today | Upcoming pair. Caps at three rows: the
 *  block is a glance, not the list — the whole card taps through to the real one. */
function TodoColumn({ label, items, emptyText, warn }: {
  label: string;
  items: Todo[];
  emptyText: string;
  warn?: boolean;
}) {
  const shown = items.slice(0, 3);
  return (
    <View style={styles.todoCol}>
      <View style={styles.todoColHead}>
        <Label wide>{label}</Label>
        {items.length > 0 && <Label tone="ink">{String(items.length)}</Label>}
      </View>
      {shown.length === 0 ? (
        <Label>{emptyText}</Label>
      ) : (
        shown.map(t => {
          const late = warn && bucketOf(t.due_date) === 'overdue';
          const mark = PRIORITY_MARK[t.priority] ?? 'faint';
          return (
            <View key={t.id} style={styles.todoItem}>
              <View style={[
                styles.todoMark,
                mark === 'filled' && styles.todoMarkFilled,
                mark === 'faint' && styles.todoMarkFaint,
              ]} />
              <Text
                style={[styles.todoItemText, late && styles.todoLate]}
                numberOfLines={1}
              >
                {t.title}
              </Text>
            </View>
          );
        })
      )}
      {items.length > shown.length && (
        <Label>{`+${items.length - shown.length} more`}</Label>
      )}
    </View>
  );
}

/** One frame in the recent strip. A horizontal strip beats a vertical list
 *  here: it shows the thumbnail at a size worth looking at, and it costs a fixed
 *  slice of screen no matter how many saves exist — a list pushed everything
 *  below it off the page. */
function RecentCard({ reel, n, onPress }: { reel: Reel; n: number; onPress: () => void }) {
  const thumb = thumbUrl(reel.thumbnail_url);
  const pending = reel.summary_status === 'pending';
  return (
    <Pressable style={styles.recentCard} onPress={onPress}>
      <View style={styles.recentCoverWrap}>
        {thumb ? (
          <Image source={{ uri: thumb }} style={styles.recentCover} resizeMode="cover" />
        ) : (
          <View style={[styles.recentCover, styles.recentCoverEmpty]}>
            <Icon name={reel.category || 'other'} size={18} color={colors.textTertiary} />
          </View>
        )}
        <Text style={styles.recentIndex}>{String(n).padStart(2, '0')}</Text>
      </View>
      <Text style={styles.recentTitle} numberOfLines={2}>{reel.title || 'Untitled save'}</Text>
      <Label numberOfLines={1}>{pending ? 'Reading…' : (reel.category || 'other')}</Label>
    </Pressable>
  );
}

/** Placeholder strip shown while the first fetch is in flight, so the screen
 *  isn't just the greeting over dead space. A gentle opacity pulse; it unmounts
 *  the instant real content (or the empty state) lands. */
function RecentSkeleton() {
  const pulse = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.8, duration: 750, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 750, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <View style={styles.block}>
      <ScrollView horizontal scrollEnabled={false} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentStrip}>
        {[0, 1, 2, 3].map(i => (
          <Animated.View key={i} style={[styles.recentCard, { opacity: pulse }]}>
            <View style={styles.recentCoverWrap}><View style={[styles.recentCover, styles.recentCoverEmpty]} /></View>
            <View style={[styles.skelLine, { width: '85%' }]} />
            <View style={[styles.skelLine, { width: '50%' }]} />
          </Animated.View>
        ))}
      </ScrollView>
    </View>
  );
}

export function Landing({ onEnter }: { onEnter: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { displayName: userName } = useAuth();
  const [reels, setReels] = useState<Reel[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [todoStats, setTodoStats] = useState<TodoStats | null>(null);
  const { settings: todoSettings, ready: todoSettingsReady } = useTodoSettings();
  const [selected, setSelected] = useState<Feature | null>(null);
  const [catFilter, setCatFilter] = useState<string | null>(null);
  // Reopens after a scheme switch remounts the tree (one-shot session flag).
  const [menuOpen, setMenuOpen] = useState(consumeReopenPanel());
  // A best-case "here's what SaveHere can do for you" line, picked once per open.
  const [greetingTip] = useState(() => GREETING_HELPERS[Math.floor(Math.random() * GREETING_HELPERS.length)]);

  useFocusEffect(
    useCallback(() => {
      setFetchError(false);
      api.listReels({ limit: LANDING_FETCH })
        .then(d => { setReels(d.items); setTotal(d.total); })
        .catch(() => setFetchError(true))
        .finally(() => setLoading(false));
      // Separate catch: a to-do hiccup must not blank out the library view.
      // `todayISO()` is the DEVICE's date — it's what the daily goal counts against.
      api.listTodos(false, todayISO())
        .then(d => { setTodos(d.items); setTodoStats(d.stats); })
        .catch(() => { setTodos([]); setTodoStats(null); });
    }, [])
  );
  const askVisible = !loading && total >= ASK_MIN_REELS;
  const hasSaves = !loading && !fetchError && total > 0;

  // Three states, one screen. Anything that can't justify itself at 50+ saves is
  // a first-run element and lives in `firstRun` only — that's exactly how the old
  // "What you can do" list became permanent furniture.
  const firstRun = !loading && !fetchError && total === 0;
  const learning = hasSaves && total < ASK_MIN_REELS;

  // Dated items only — "Someday" has no claim on today's attention. The server
  // already returns them date-ascending then priority, so slicing preserves
  // "soonest first, most important within a day".
  // Two columns, so two lists. Overdue folds into "Today" rather than getting a
  // column of its own — it IS today's work, just late, and a third column would
  // not survive a narrow phone.
  const overdue = todos.filter(t => bucketOf(t.due_date) === 'overdue');
  const todayItems = [...overdue, ...todos.filter(t => bucketOf(t.due_date) === 'today')];
  const upcomingItems = todos.filter(t => bucketOf(t.due_date) === 'upcoming');
  const dueSoon = [...todayItems, ...upcomingItems];
  const overdueCount = overdue.length;

  // Category chips filter the already-fetched page locally — no extra request,
  // and no filter state to hand off to the library screen.
  const catList = Array.from(new Set(reels.map(r => r.category).filter(Boolean))) as string[];
  const visible = catFilter ? reels.filter(r => r.category === catFilter) : reels;
  const recent = visible.slice(0, RECENT_LIMIT);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + 96 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Masthead ─────────────────────────────────────────────────────── */}
        <View style={styles.headerRow}>
          <Wordmark size={22} />
          <Pressable style={styles.menuBtn} onPress={() => setMenuOpen(true)} accessibilityLabel="Menu">
            <Icon name="menu" size={17} color={colors.textPrimary} />
          </Pressable>
        </View>
        <Rule />

        {/* ── Greeting. Large, light, tightly tracked — the one place on the
            screen that behaves like a headline. ── */}
        <View style={styles.greeting}>
          <Text style={styles.hi}>Hi, {userName}.</Text>
          <Body style={styles.welcome}>
            {fetchError
              ? "Can't reach the server right now."
              : hasSaves
                ? greetingTip
                : 'Your second brain for short-form content.'}
          </Body>
        </View>

        {/* Loading — a shaped placeholder so the fetch gap isn't dead space. */}
        {loading && <RecentSkeleton />}

        {/* ── FIRST RUN (0 saves) ──────────────────────────────────────────────
            "What you can do" lives HERE and only here. With nothing to show, the
            job of the screen is to explain the payoff — which is what this copy
            was always for. It disappears the moment there's real content. */}
        {firstRun && (
          <View style={styles.block}>
            <Label wide style={styles.sectionLabel}>What a save becomes</Label>
            <Rule />
            {FEATURES.map((f, i) => (
              <Pressable key={f.title} style={styles.feature} onPress={() => setSelected(f)}>
                <Index n={i + 1} style={styles.featureIndex} />
                <View style={styles.featureText}>
                  <Text style={styles.featureTitle}>{f.title}</Text>
                  <Label>{f.desc}</Label>
                </View>
                <Icon name="chevron-right" size={14} color={colors.textTertiary} />
              </Pressable>
            ))}
            <Rule />
          </View>
        )}

        {/* ── LEARNING (1 .. ASK_MIN_REELS-1) ──────────────────────────────────
            Exactly one tip, and it's progress toward something real — not a
            brochure. Same threshold as the Ask unlock. */}
        {learning && (
          <View style={styles.block}>
            <Rule />
            <View style={styles.progress}>
              <Label wide>{`Save ${ASK_MIN_REELS - total} more to unlock Ask`}</Label>
              {/* Segmented, not a filled bar: discrete marks say "two of five"
                  at a glance where a grey bar just says "some". */}
              <View style={styles.progressTrack}>
                {Array.from({ length: ASK_MIN_REELS }).map((_, i) => (
                  <View key={i} style={[styles.progressTick, i < total && styles.progressTickOn]} />
                ))}
              </View>
              <Body style={styles.progressSub}>
                Ask answers from your own saves — it works best with a few to draw on.
              </Body>
            </View>
            <Rule />
          </View>
        )}

        {/* ── Ask — above the recent strip so it's the first thing after the
            greeting once unlocked (owner: bring Ask up above categories). ── */}
        {askVisible && (
          <>
            <Pressable style={styles.navRow} onPress={() => router.push('/ask')}>
              <View style={styles.navText}>
                <Text style={styles.navTitle}>Ask your library</Text>
                <Label>Answers pulled straight from your own saves</Label>
              </View>
              <Icon name="chevron-right" size={15} color={colors.textTertiary} />
            </Pressable>
            <Rule />
          </>
        )}

        {/* ── TO-DO — what you actually meant to act on. Sits directly BELOW Ask
            (owner). Today and Upcoming run SIDE BY SIDE so one glance covers
            both horizons; overdue folds into Today because it is today's work,
            just late. Collapses to a single quiet row when nothing is due, so
            it never manufactures urgency. Hidden entirely if the user turns it
            off in the list's settings. ── */}
        {!loading && todoSettingsReady && todoSettings.showOnHome && (
          <>
            {dueSoon.length > 0 ? (
              <Pressable style={styles.todoBlock} onPress={() => router.push('/todos')}>
                <View style={styles.navRowInner}>
                  <View style={styles.navText}>
                    <Text style={styles.navTitle}>{TODO_LANDING_TITLE}</Text>
                    <Label tone={overdueCount > 0 ? 'ink' : 'muted'}>
                      {overdueCount > 0
                        ? `${overdueCount} overdue · ${dueSoon.length} on deck`
                        : `${dueSoon.length} coming up`}
                    </Label>
                  </View>
                  <Icon name="chevron-right" size={15} color={colors.textTertiary} />
                </View>

                {todoStats?.completed_today != null && (
                  <TodoGoalBar
                    done={todoStats.completed_today}
                    goal={todoSettings.dailyGoal}
                    compact
                    style={styles.todoGoal}
                  />
                )}

                <View style={styles.todoCols}>
                  <TodoColumn label="Today" items={todayItems} emptyText="Nothing due" warn />
                  <View style={styles.todoColDivider} />
                  <TodoColumn label="Upcoming" items={upcomingItems} emptyText="Clear ahead" />
                </View>
              </Pressable>
            ) : (
              <Pressable style={styles.navRow} onPress={() => router.push('/todos')}>
                <View style={styles.navText}>
                  <Text style={styles.navTitle}>{TODO_LANDING_TITLE}</Text>
                  <Label>
                    {todos.length > 0
                      ? `${todos.length} with no date — give one a day to see it here`
                      : 'Nothing due. Turn a save into something you actually finish'}
                  </Label>
                </View>
                <Icon name="chevron-right" size={15} color={colors.textTertiary} />
              </Pressable>
            )}
            <Rule />
          </>
        )}

        {/* ── YOUR SAVES — the reason this screen exists ─────────────────────── */}
        {hasSaves && (
          <View style={styles.block}>
            {catList.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                <Pressable style={styles.chip} onPress={() => setCatFilter(null)}>
                  <Label tone={!catFilter ? 'ink' : 'muted'} wide>All</Label>
                  <View style={[styles.chipRule, !catFilter && styles.chipRuleOn]} />
                </Pressable>
                {catList.map(c => (
                  <Pressable key={c} style={styles.chip} onPress={() => setCatFilter(catFilter === c ? null : c)}>
                    <Label tone={catFilter === c ? 'ink' : 'muted'} wide>{c}</Label>
                    <View style={[styles.chipRule, catFilter === c && styles.chipRuleOn]} />
                  </Pressable>
                ))}
              </ScrollView>
            )}

            <Label wide style={styles.sectionLabel}>{catFilter || 'Recent'}</Label>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recentStrip}
              // Snap to frame width so the strip settles on a frame, not mid-cut.
              snapToInterval={RECENT_CARD_W}
              decelerationRate="fast"
            >
              {recent.map((r, i) => (
                <RecentCard key={r.id} reel={r} n={i + 1} onPress={() => router.push(`/reel/${r.id}`)} />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Rolling tips — the same benefit lines that roll on the auth screen. */}
        {!loading && <RollingTagline style={styles.tips} />}

        <View style={{ flex: 1, minHeight: spacing.lg }} />

        <Rule />
        <Body style={styles.disclaimer}>
          Summaries are generated by AI and may be wrong or have gaps — add details in Notes and
          re-summarize to correct one. Saved content belongs to its original creators; SaveHere keeps
          links and summaries for personal reference only.
        </Body>
      </ScrollView>

      {/* ── Fixed bottom bar: Library + Save ─────────────────────────────────
          Two squares sharing a seam. Save is the filled one — it is the single
          most important action on the screen and the system's one inversion. */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.sm }]}>
        <GhostButton label="Library" onPress={onEnter} style={styles.bottomBtn} />
        <FilledButton label="Save" trailing="+" onPress={() => router.push('/save')} style={styles.bottomBtn} />
      </View>

      {/* ── Feature detail ──────────────────────────────────────────────────── */}
      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)} statusBarTranslucent>
        <View style={styles.sheetOverlay}>
          <Pressable style={styles.sheetTap} onPress={() => setSelected(null)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.sheetHead}>
              <Label wide>Feature</Label>
              <Pressable onPress={() => setSelected(null)} hitSlop={10} accessibilityLabel="Close">
                <Icon name="close" size={18} color={colors.textPrimary} />
              </Pressable>
            </View>
            <Rule style={{ marginTop: spacing.sm }} />
            <Title style={styles.sheetTitle}>{selected?.title}</Title>
            <Body style={styles.sheetDetail}>{selected?.detail}</Body>
            <GhostButton label="Got it" onPress={() => setSelected(null)} style={styles.sheetCta} />
          </View>
        </View>
      </Modal>

      <ProfilePanel
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        reels={reels}
        total={total}
        showAsk={askVisible}
      />
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md, flexGrow: 1 },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
  },
  menuBtn: {
    width: 36, height: 36,
    borderWidth: 1, borderColor: colors.ghostLine,
    alignItems: 'center', justifyContent: 'center',
  },

  greeting: { paddingTop: spacing.xl, paddingBottom: spacing.lg },
  hi: {
    color: colors.textPrimary,
    fontFamily: typeface.display,
    fontSize: font.display,
    lineHeight: font.display * 1.02,
    letterSpacing: tracking.display,
  },
  welcome: { marginTop: spacing.md, maxWidth: 460 },

  block: { marginBottom: spacing.lg },
  sectionLabel: { marginBottom: spacing.sm },

  feature: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  featureIndex: { width: 22 },
  featureText: { flex: 1, minWidth: 0, gap: 2 },
  featureTitle: {
    color: colors.textPrimary,
    fontFamily: typeface.display,
    fontSize: font.md,
    letterSpacing: -0.2,
  },

  progress: { paddingVertical: spacing.md, gap: spacing.sm },
  progressTrack: { flexDirection: 'row', gap: 3 },
  progressTick: { flex: 1, height: 4, backgroundColor: colors.ghostLine },
  progressTickOn: { backgroundColor: colors.textPrimary },
  progressSub: { fontSize: font.sm, lineHeight: 19 },

  navRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  navRowInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  navText: { flex: 1, minWidth: 0, gap: 2 },
  navTitle: {
    color: colors.textPrimary,
    fontFamily: typeface.display,
    fontSize: font.md,
    letterSpacing: -0.2,
  },

  todoBlock: { paddingVertical: spacing.md, gap: spacing.md },
  todoGoal: { marginTop: 0 },
  todoCols: { flexDirection: 'row', gap: spacing.md },
  todoColDivider: { width: 1, backgroundColor: colors.ghostLine },
  // minWidth:0 is load-bearing — react-native-web won't shrink a flex child
  // without it, so a long title shoves the other column off the card.
  todoCol: { flex: 1, minWidth: 0, gap: spacing.xs },
  todoColHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  todoItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  // Priority by shape, not hue — see PRIORITY_MARK above.
  todoMark: { width: 7, height: 7, borderWidth: 1, borderColor: colors.textSecondary },
  todoMarkFilled: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  todoMarkFaint: { borderColor: colors.ghostLine },
  todoItemText: {
    flex: 1,
    color: colors.textSecondary,
    fontFamily: typeface.body,
    fontSize: font.sm,
  },
  todoLate: { color: colors.textPrimary, textDecorationLine: 'underline' },

  chipRow: { gap: spacing.lg, paddingBottom: spacing.md },
  chip: { gap: spacing.xs },
  chipRule: { height: 1, backgroundColor: 'transparent' },
  chipRuleOn: { backgroundColor: colors.textPrimary },

  recentStrip: { gap: 0 },
  recentCard: { width: RECENT_CARD_W, borderWidth: 0.5, borderColor: colors.ghostLine, padding: spacing.sm, gap: spacing.xs },
  recentCoverWrap: { position: 'relative' },
  recentCover: { width: '100%', aspectRatio: 3 / 4, backgroundColor: colors.card },
  recentCoverEmpty: { alignItems: 'center', justifyContent: 'center' },
  recentIndex: {
    position: 'absolute', top: 4, left: 5,
    color: 'rgba(248,248,248,0.55)',
    fontFamily: typeface.label,
    fontSize: font.xs,
    letterSpacing: tracking.label,
    fontVariant: ['tabular-nums'],
  },
  recentTitle: {
    color: colors.textPrimary,
    fontFamily: typeface.display,
    fontSize: font.sm,
    lineHeight: 16,
    letterSpacing: -0.2,
  },
  skelLine: { height: 7, backgroundColor: colors.ghostLine },

  tips: { marginTop: spacing.md },
  disclaimer: { fontSize: font.sm, lineHeight: 19, paddingTop: spacing.md },

  bottomBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.ghostLine,
  },
  bottomBtn: { flex: 1 },

  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', justifyContent: 'flex-end' },
  sheetTap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheet: {
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.textPrimary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { marginTop: spacing.lg },
  sheetDetail: { marginTop: spacing.md, fontSize: font.sm, lineHeight: 21 },
  sheetCta: { marginTop: spacing.lg },
}));
