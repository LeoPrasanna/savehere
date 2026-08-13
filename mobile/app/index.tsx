import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, ScrollView, StyleSheet, ActivityIndicator,
  RefreshControl, useWindowDimensions, Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, Reel } from '../services/api';
import { ReelCard, aspectFor } from '../components/ReelCard';
import { SkeletonGrid } from '../components/SkeletonCard';
import { Pressable } from '../components/Pressable';
import { Icon } from '../components/Icon';
import { Landing } from '../components/Landing';
import { Label, Body, Title, Rule, GhostButton, Wordmark } from '../components/kit';
import { hasEnteredLibrary, markEnteredLibrary } from '../services/sessionFlags';
import { onUi, emitUi } from '../services/uiBus';
import { ASK_MIN_REELS } from '../constants/limits';
import { TAB_BAR_CLEARANCE } from '../components/TabBar';
import { LinearGradient } from 'expo-linear-gradient';
import { RollingTagline } from '../components/RollingTagline';
import { useAuth } from '../contexts/AuthContext';
import { Avatar } from '../components/Avatar';
import { colors, spacing, font, radius, tracking, typeface, categoryMeta, CATEGORY_OPTIONS, GRID_GAP, themed, gradients, hazeLocations } from '../constants/theme';

const CATEGORIES = ['all', ...CATEGORY_OPTIONS];
const PAGE = 24;

/** The width a tile WANTS to be, in points. Measured off Pinterest: ~181pt on
 *  a 390pt phone at 2 columns. The column count is solved for this rather than
 *  the other way round — see `numColumns` below. */
const TARGET_TILE = 180;

/** Module-level so the reference is stable — RollingTagline is memoized and an
 *  inline array would defeat that on every render. */
const LIBRARY_CAPABILITIES = [
  'Summarize any reel you save',
  'Extract cooking recipes, step by step',
  'Build guided workouts with rest timers',
  'Turn a tutorial into a checklist you can tick off',
  'Ask your library — answered from your own saves',
  'Rediscover saves you forgot you had',
];

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, displayName } = useAuth();
  const { width } = useWindowDimensions();
  /**
   * Columns are derived from a TARGET TILE WIDTH, not from device breakpoints.
   *
   * ⚠️ This was `width < 600 ? 2 : width < 1024 ? 3 : 4`, which is why the grid
   * looked right on a phone and wrong on a tablet (owner, 2026-08-12). Fixed
   * breakpoints hold the COLUMN COUNT steady and let the tiles stretch, so a
   * 10" tablet at 3 columns rendered ~330pt-wide tiles — nearly double a
   * phone's — and a wall of vast thumbnails with 12px gutters reads as a
   * broken layout rather than a denser one.
   *
   * Pinterest does the opposite, and it is the whole trick: tile width stays
   * roughly constant (~180pt) and the column count grows to fill the screen.
   * A tablet then shows MORE of your library at the size the tiles were
   * designed for, instead of fewer, larger ones.
   *
   * Clamped at 2 so a small phone never drops to a single column (that is a
   * list, not a mosaic), and at 6 so a desktop browser does not shred the grid
   * into a filmstrip.
   */
  const numColumns = Math.max(2, Math.min(6, Math.round((width - GRID_GAP) / (TARGET_TILE + GRID_GAP))));
  const [reels, setReels] = useState<Reel[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');
  // Session-scoped (services/sessionFlags): remounts don't bounce back to the
  // landing, but a sign-out/sign-in resets it so new users start at Landing.
  const [entered, setEntered] = useState(hasEnteredLibrary());
  // The Home and Library tabs flip that flag from OUTSIDE this route (the tab
  // bar lives above the router), so the screen has to be told to re-read it.
  useEffect(() => onUi('libraryState', () => setEntered(hasEnteredLibrary())), []);
  const [scrolled, setScrolled] = useState(false);

  const load = useCallback(async (category = activeCategory) => {
    try {
      setError('');
      const data = await api.listReels({
        category: category !== 'all' ? category : undefined,
        limit: PAGE,
        offset: 0,
      });
      setReels(data.items);
      setTotal(data.total);
    } catch (e: any) {
      setError('Could not connect to backend. Make sure the server is running on port 8000.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeCategory]);

  const loadMore = useCallback(async () => {
    if (loadingMore || reels.length >= total) return;
    setLoadingMore(true);
    try {
      const data = await api.listReels({
        category: activeCategory !== 'all' ? activeCategory : undefined,
        limit: PAGE,
        offset: reels.length,
      });
      setReels(prev => [...prev, ...data.items]);
      setTotal(data.total);
    } catch {
      // transient failure
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, reels.length, total, activeCategory]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    setOffline(!window.navigator.onLine);
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const hasPending = reels.some(r => r.summary_status === 'pending');
  useEffect(() => {
    if (!entered || !hasPending) return;
    const t = setInterval(() => { load(); }, 4000);
    return () => clearInterval(t);
  }, [entered, hasPending, load]);

  const onCategoryChange = (cat: string) => {
    setActiveCategory(cat);
    setLoading(true);
    load(cat);
  };

  // ⚠️ A local `goHome()` used to live here for a header Home button that round
  // five removed. Going home is now the tab bar's job — TabBar.tsx and
  // HomeButton.tsx both call `clearEnteredLibrary()` and emit `libraryState`,
  // which the subscription above turns into `setEntered(false)`. Do not add a
  // second copy of that logic here.

  /**
   * Distribute tiles into columns, shortest-column-first.
   *
   * Running height is tracked in WIDTH-UNITS: a tile of aspect 0.75 is 1/0.75
   * columns TALL. (An earlier version added `aspect` instead of its reciprocal,
   * which inverted the comparison — the tiles it thought were tallest were
   * actually the shortest, so the columns drifted badly out of level.) Ordering
   * within a column stays newest-first, which is what the user expects; only
   * the column assignment is height-driven.
   */
  const mosaic = useMemo(() => {
    const cols: { reel: Reel; aspect: number; idx: number }[][] =
      Array.from({ length: numColumns }, () => []);
    const heights = new Array(numColumns).fill(0);
    reels.forEach((reel, idx) => {
      const aspect = aspectFor(reel);
      let shortest = 0;
      for (let i = 1; i < numColumns; i++) if (heights[i] < heights[shortest]) shortest = i;
      cols[shortest].push({ reel, aspect, idx });
      heights[shortest] += 1 / aspect;   // height in width-units
    });
    return cols;
  }, [reels, numColumns]);

  if (!entered) {
    return <Landing onEnter={() => { markEnteredLibrary(); setEntered(true); }} />;
  }

  return (
    <View style={styles.container}>
      {/* Nocturnal Dimension haze — the screen-root atmosphere. Rendered ONCE
          here, never per-card, and non-interactive so it cannot eat a tap.
          No blur anywhere: this is a single GPU draw on web/Android too. */}
      <LinearGradient
        colors={gradients.haze}
        locations={hazeLocations}
        style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}
      />
      {/* ── Header ───────────────────────────────────────────────────────────
          Identity, a count, and the hamburger the owner wants on every page.
          Home and Save used to live here too; both are tabs now. No logo mark,
          no gradient, no shadow — the header is metadata about the sheet below
          it and speaks in the same small tracked voice. */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        {/* The face, and it is a control: tapping it opens the same profile
            panel as the hamburger. An avatar that looks tappable and isn't is
            the more annoying option, and this is where every other app puts
            the way into your account. */}
        <Pressable
          style={styles.hAvatar}
          onPress={() => emitUi('openProfile')}
          accessibilityLabel="Your profile"
        >
          <Avatar value={profile.avatar} size={34} iconSize={18} />
        </Pressable>
        <View style={styles.brandRow}>
          <Wordmark size={22} />
          {/* displayName is already nickname > first name > a name derived from
              the email, so this needs no fallback logic of its own. */}
          <Label style={styles.count} numberOfLines={1}>
            {displayName} · {total > 0 ? `${total} saved` : 'nothing saved yet'}
          </Label>
        </View>
        <Pressable style={styles.hBtn} onPress={() => emitUi('openProfile')} accessibilityLabel="Menu">
          <Icon name="menu" size={17} color={colors.textPrimary} />
        </Pressable>
      </View>

      {/* The search field used to sit here. Replaced (owner, 2026-08-09) with a
          rolling list of what the library can actually do for a save.
          ⚠️ There is NO search anywhere in the app any more, client or server:
          the owner deleted the vertical on 2026-08-10 rather than carry an
          unreachable feature (`services/search.py`, `GET /api/reels/search`,
          `api.searchReels()` and their tests are all gone — recover from git if
          search returns). Category bubbles are the only way to narrow the grid.
          If search comes back at scale, embeddings, not the lexical ranker. */}
      <RollingTagline
        compact
        shuffle
        lines={LIBRARY_CAPABILITIES}
        style={styles.capabilityRoll}
        numberOfLines={1}
      />
      {/* ⚠️ A full-bleed <Rule/> used to sit here, directly under the roll's own
          inset bottom hairline — two rules, 1px apart, at different widths.
          Removed (owner, 2026-08-10); the roll keeps its own line and its 42px
          footprint, so the grid below does not shift. */}

      {/* ── Category filter ──────────────────────────────────────────────────
          Round icon bubbles with the name beneath, mirroring the reference
          app's avatar row (owner direction, 2026-08-01). `radius.circle` is the
          ONLY sanctioned circle in the system — see constants/theme.ts.
          Selection is an inversion (filled bubble, canvas-coloured icon), the
          same emphasis grammar the primary button uses. */}
      <FlatList
        horizontal
        data={CATEGORIES}
        keyExtractor={c => c}
        showsHorizontalScrollIndicator={false}
        style={styles.catList}
        contentContainerStyle={styles.catContent}
        renderItem={({ item }) => {
          const active = activeCategory === item;
          const meta = categoryMeta[item] ?? categoryMeta.other;
          return (
            <Pressable
              style={styles.cat}
              onPress={() => onCategoryChange(item)}
              accessibilityLabel={`${item}${active ? ', selected' : ''}`}
            >
              <View style={[styles.catBubble, active && styles.catBubbleOn]}>
                <Icon
                  name={meta.icon}
                  size={20}
                  color={active ? colors.background : colors.textSecondary}
                />
              </View>
              <Label tone={active ? 'ink' : 'muted'} numberOfLines={1} style={styles.catName}>
                {item}
              </Label>
            </Pressable>
          );
        }}
      />
      <Rule style={scrolled ? undefined : styles.ruleHidden} />

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      {loading ? (
        <SkeletonGrid columns={numColumns} rows={3} />
      ) : error && reels.length === 0 ? (
        <View style={styles.empty}>
          <Label wide>Offline</Label>
          <Title style={styles.emptyTitle}>Can't reach the server</Title>
          <Body style={styles.emptyText}>{error}</Body>
          <GhostButton label="Retry" onPress={() => { setLoading(true); load(); }} style={styles.emptyCta} />
        </View>
      ) : reels.length === 0 ? (
        <View style={styles.empty}>
          <Label wide>Empty sheet</Label>
          <Title style={styles.emptyTitle}>
            {activeCategory === 'all' ? 'Nothing saved yet' : `Nothing in ${activeCategory}`}
          </Title>
          <Body style={styles.emptyText}>
            {activeCategory === 'all'
              ? 'Save your first link and the summary appears in seconds.'
              : 'Saves you expected here may be filed under a different category.'}
          </Body>
          {activeCategory === 'all' ? (
            <GhostButton label="Save your first link" trailing="→" onPress={() => router.push('/save')} style={styles.emptyCta} />
          ) : (
            <GhostButton label="Show all categories" onPress={() => onCategoryChange('all')} style={styles.emptyCta} />
          )}
        </View>
      ) : (
        <>
        {(offline || error) && (
          <Pressable style={styles.banner} onPress={() => { setLoading(true); load(); }}>
            <Icon name="alert-circle" size={13} color={colors.background} />
            <Text style={styles.bannerText}>
              {offline ? "OFFLINE — CHANGES MAY NOT SAVE" : "COULDN'T REFRESH — TAP TO RETRY"}
            </Text>
          </Pressable>
        )}
        {/* ── The mosaic ───────────────────────────────────────────────────
            Tiles are staggered, not aligned into rows: each one goes to
            whichever column is currently shortest, so neighbours sit at
            different heights the way a real contact sheet does.

            ponytail: a ScrollView, not a FlatList — masonry and row
            virtualization are incompatible without measuring every tile, and a
            personal library is tens-to-hundreds of items. If someone turns up
            with 2,000 saves this is the thing that gets slow; the fix then is a
            windowed masonry (react-native-super-grid or a measured
            FlashList), not a smaller diff here. */}
        <ScrollView
          style={styles.grid}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={32}
          onScroll={e => {
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
            setScrolled(contentOffset.y > 4);
            // FlatList's onEndReached, by hand: fire once we're within a
            // screen-and-a-half of the bottom.
            const nearBottom =
              contentOffset.y + layoutMeasurement.height >= contentSize.height - layoutMeasurement.height * 1.5;
            if (nearBottom) loadMore();
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              tintColor={colors.textSecondary}
              colors={[colors.textPrimary]}
              progressBackgroundColor={colors.card}
            />
          }
        >
          <View style={styles.masonry}>
            {mosaic.map((col, ci) => (
              <View key={ci} style={styles.column}>
                {col.map(({ reel, aspect, idx }) => (
                  <ReelCard
                    key={reel.id}
                    reel={reel}
                    index={idx}
                    aspect={aspect}
                    onDelete={id => { setReels(prev => prev.filter(r => r.id !== id)); setTotal(t => Math.max(0, t - 1)); }}
                  />
                ))}
              </View>
            ))}
          </View>
          {loadingMore && <ActivityIndicator color={colors.textPrimary} style={{ marginVertical: spacing.md }} />}
          <Body style={styles.disclaimer}>
            Summaries are generated by AI and may be wrong or have gaps — edit them and add your
            own notes freely. Saved content belongs to its original creators.
          </Body>
        </ScrollView>
        </>
      )}

    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  // minWidth:0 is load-bearing: without it a long nickname pushes the menu
  // button off the right edge instead of ellipsizing inside its own column.
  brandRow: { flex: 1, minWidth: 0, gap: 2 },
  count: { marginBottom: 2 },
  hAvatar: {
    width: 40, height: 40,
    borderWidth: 1,
    borderColor: colors.ghostLine,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // Square hairline. No fill, no radius, no shadow.
  hBtn: {
    width: 36, height: 36,
    borderWidth: 1,
    borderColor: colors.ghostLine,
    alignItems: 'center',
    justifyContent: 'center',
  },

  catList: { flexGrow: 0 },
  catContent: { paddingHorizontal: spacing.md, gap: spacing.md, alignItems: 'flex-start' },
  cat: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md, width: 62 },
  // The system's one circle (radius.circle). Selection inverts rather than
  // tinting — there is no accent hue to tint with.
  catBubble: {
    width: 52, height: 52,
    borderRadius: radius.circle,
    borderWidth: 1,
    borderColor: colors.ghostLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catBubbleOn: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  catName: { textAlign: 'center', width: '100%' },
  ruleHidden: { backgroundColor: 'transparent' },

  banner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.textPrimary, paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
  },
  bannerText: {
    color: colors.background,
    fontFamily: typeface.label,
    fontSize: font.xs,
    letterSpacing: tracking.label,
  },

  grid: { flex: 1 },
  // ⚠️ GRID_GAP is used for BOTH the column gap and the page's own side padding,
  // so the space at the screen edge matches the space between tiles. A gutter in
  // the middle with none at the edges reads as a mistake.
  masonry: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: GRID_GAP,
    paddingHorizontal: GRID_GAP,
  },
  // minWidth:0 is load-bearing on react-native-web — without it a long title
  // inside a tile can push its column wider than its share.
  column: { flex: 1, minWidth: 0, gap: GRID_GAP },
  // Clears the floating tab bar (its own height + the safe-area inset it adds).
  list: { paddingTop: GRID_GAP, paddingBottom: TAB_BAR_CLEARANCE + spacing.xl },
  disclaimer: {
    fontSize: font.sm,
    lineHeight: 19,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  emptyTitle: { textAlign: 'center' },
  emptyText: { textAlign: 'center', maxWidth: 380 },
  emptyCta: { marginTop: spacing.sm, alignSelf: 'stretch', maxWidth: 320 },

  // Keeps the exact footprint the search row occupied, so the grid below does
  // not shift.
  capabilityRoll: {
    marginHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.ghostLine,
    height: 42,
    marginBottom: spacing.sm,
  },
}));
