import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, ScrollView, StyleSheet, ActivityIndicator,
  RefreshControl, TextInput, useWindowDimensions, Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Search, XCircle } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, Reel } from '../services/api';
import { ReelCard, aspectFor } from '../components/ReelCard';
import { SkeletonGrid } from '../components/SkeletonCard';
import { Pressable } from '../components/Pressable';
import { Icon } from '../components/Icon';
import { ProfilePanel } from '../components/ProfilePanel';
import { Landing } from '../components/Landing';
import { Label, Body, Title, Rule, GhostButton, Wordmark } from '../components/kit';
import { hasEnteredLibrary, markEnteredLibrary, clearEnteredLibrary, consumeReopenPanel } from '../services/sessionFlags';
import { rememberThumbs } from '../services/thumbCache';
import { ASK_MIN_REELS } from '../constants/limits';
import { colors, spacing, font, radius, tracking, typeface, categoryMeta, CATEGORY_OPTIONS, themed } from '../constants/theme';

const CATEGORIES = ['all', ...CATEGORY_OPTIONS];
const PAGE = 24;

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const numColumns = width < 600 ? 2 : width < 1024 ? 3 : 4;
  const [reels, setReels] = useState<Reel[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Reel[] | null>(null);
  const [searching, setSearching] = useState(false);
  // Reopens automatically after a scheme switch remounts the tree (one-shot
  // flag). Only consume it when THIS screen owns the visible panel — on the
  // Landing branch, Landing renders its own panel and consumes the flag itself.
  const [menuOpen, setMenuOpen] = useState(hasEnteredLibrary() ? consumeReopenPanel() : false);
  // Session-scoped (services/sessionFlags): remounts don't bounce back to the
  // landing, but a sign-out/sign-in resets it so new users start at Landing.
  const [entered, setEntered] = useState(hasEnteredLibrary());
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
      // Feeds the signed-out welcome collage on the next launch.
      rememberThumbs(data.items.map(r => r.thumbnail_url));
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

  useEffect(() => {
    const q = search.trim();
    if (!q) { setSearchResults(null); setSearching(false); return; }

    // Instant feedback: filter what's already loaded so results appear on the
    // keystroke instead of after debounce + round-trip. The server answer
    // replaces this a moment later — it searches the WHOLE library (and tolerates
    // typos), where this only sees the loaded page.
    // A selected category scopes search to that category; 'all' searches the
    // whole library. Server search is global, so we scope its result here.
    const scope = (items: Reel[]) =>
      activeCategory === 'all'
        ? items
        : items.filter(r => (r.category || '').toLowerCase() === activeCategory);

    const local = q.toLowerCase();
    setSearchResults(
      scope(reels).filter(r =>
        (r.title || '').toLowerCase().includes(local) ||
        (r.category || '').toLowerCase().includes(local) ||
        (r.tags || []).some(t => t.toLowerCase().includes(local))
      )
    );
    setSearching(true);

    // 250 ms rather than 400: with local results already on screen the debounce
    // only governs the network call, so it can be tighter without spamming.
    const timer = setTimeout(async () => {
      try {
        const data = await api.searchReels(q);
        // Ignore a stale response that lost the race to a newer query.
        setSearch(cur => {
          if (cur.trim() === q) setSearchResults(scope(data.items));
          return cur;
        });
      } catch {
        // Keep the local matches rather than blanking the screen on a failed
        // request — some results beat "no results" when the query did match.
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [search, reels, activeCategory]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const hasPending = reels.some(r => r.summary_status === 'pending');
  useEffect(() => {
    if (!entered || !hasPending) return;
    const t = setInterval(() => { load(); }, 4000);
    return () => clearInterval(t);
  }, [entered, hasPending, load]);

  const onCategoryChange = (cat: string) => {
    // Clear the query first. Search is global while a category is a filter, so
    // leaving a query active meant `displayList` kept returning search results
    // and the freshly-loaded category was fetched and then ignored — picking a
    // category simply appeared to do nothing.
    setSearch('');
    setSearchResults(null);
    setSearching(false);
    setActiveCategory(cat);
    setLoading(true);
    load(cat);
  };

  /** Widen an unproductive in-category search to the whole library WITHOUT
   *  dropping the query (onCategoryChange clears it; this keeps it and re-scopes). */
  const searchEverywhere = () => {
    setActiveCategory('all');
    setLoading(true);
    load('all');
  };

  /** Back to the landing view. Must clear the session flag as well as local
   *  state: `entered` is seeded from that flag on every mount, so without this
   *  the next remount (opening a reel and coming back, returning from /save)
   *  silently dropped the user back into the library and Home looked broken. */
  const goHome = () => {
    clearEnteredLibrary();
    setSearch('');
    setSearchResults(null);
    setActiveCategory('all');
    setEntered(false);
  };

  const inSearchMode = search.trim().length > 0;
  const displayList = inSearchMode ? (searchResults ?? []) : reels;

  /**
   * Distribute tiles into columns, shortest-column-first.
   *
   * Running height is tracked in WIDTH-UNITS (a tile of aspect 0.75 is 0.75
   * columns tall) plus a constant for the caption block, so the columns finish
   * at roughly the same depth without measuring anything on screen. Ordering
   * within a column stays newest-first, which is what the user expects; only
   * the left/right assignment is height-driven.
   */
  const CAPTION_UNITS = 0.42;
  const mosaic = useMemo(() => {
    const cols: { reel: Reel; aspect: number; idx: number }[][] =
      Array.from({ length: numColumns }, () => []);
    const heights = new Array(numColumns).fill(0);
    displayList.forEach((reel, idx) => {
      const aspect = aspectFor(reel);
      let shortest = 0;
      for (let i = 1; i < numColumns; i++) if (heights[i] < heights[shortest]) shortest = i;
      cols[shortest].push({ reel, aspect, idx });
      heights[shortest] += aspect + CAPTION_UNITS;
    });
    return cols;
  }, [displayList, numColumns]);

  if (!entered) {
    return <Landing onEnter={() => { markEnteredLibrary(); setEntered(true); }} />;
  }

  return (
    <View style={styles.container}>
      {/* ── Header ───────────────────────────────────────────────────────────
          The wordmark, a count, and three square hairline buttons. No logo
          mark, no gradient, no shadow — the header is metadata about the sheet
          below it and speaks in the same small tracked voice. */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={goHome} style={styles.brandRow}>
          <Wordmark size={26} />
          <Label style={styles.count}>
            {total > 0 ? `${total} saved` : 'Nothing saved yet'}
          </Label>
        </Pressable>
        <View style={styles.headerActions}>
          <Pressable style={styles.hBtn} onPress={goHome} accessibilityLabel="Home">
            <Icon name="home" size={17} color={colors.textPrimary} />
          </Pressable>
          <Pressable style={styles.hBtn} onPress={() => router.push('/save')} accessibilityLabel="Save">
            <Icon name="add" size={17} color={colors.textPrimary} />
          </Pressable>
          <Pressable style={styles.hBtn} onPress={() => setMenuOpen(true)} accessibilityLabel="Menu">
            <Icon name="menu" size={17} color={colors.textPrimary} />
          </Pressable>
        </View>
      </View>
      <Rule />

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
      ) : searching ? (
        <ActivityIndicator color={colors.textPrimary} style={styles.loader} size="large" />
      ) : displayList.length === 0 ? (
        <View style={styles.empty}>
          <Label wide>{inSearchMode ? 'No matches' : 'Empty sheet'}</Label>
          <Title style={styles.emptyTitle}>
            {inSearchMode ? 'Nothing found' : 'Nothing saved yet'}
          </Title>
          <Body style={styles.emptyText}>
            {inSearchMode
              ? (activeCategory !== 'all'
                  ? `No matches for "${search.trim()}" in ${activeCategory}. It may be filed under a different category.`
                  : `No results for "${search.trim()}".`)
              : 'Save your first link and the summary appears in seconds.'}
          </Body>
          {inSearchMode && activeCategory !== 'all' && (
            <GhostButton label="Search all categories" onPress={searchEverywhere} style={styles.emptyCta} />
          )}
          {!inSearchMode && (
            <GhostButton label="Save your first link" trailing="→" onPress={() => router.push('/save')} style={styles.emptyCta} />
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
            if (nearBottom && !inSearchMode) loadMore();
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

      {/* ── Search, docked at the bottom (iOS pattern: Safari, App Store) ──
          An underlined field rather than a pill: the system defines inputs with
          the same 1px seam it uses everywhere else. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.bottomWrap}
        pointerEvents="box-none"
      >
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.sm }]}>
          <View style={styles.search}>
            <Search size={15} color={colors.textTertiary} strokeWidth={1.35} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search your saves"
              placeholderTextColor={colors.textTertiary}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch('')} hitSlop={8}>
                <XCircle size={15} color={colors.textTertiary} strokeWidth={1.35} />
              </Pressable>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      <ProfilePanel visible={menuOpen} onClose={() => setMenuOpen(false)} reels={reels} total={total} showAsk={total >= ASK_MIN_REELS} />
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
  brandRow: { gap: 2 },
  count: { marginBottom: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
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
  // ⚠️ NO GUTTERS AND NO PAGE MARGIN. Full-bleed to the screen edge; the only
  // visual separator is the 1px ghost line each tile draws for itself, so
  // neighbours share a seam instead of floating apart.
  masonry: { flexDirection: 'row', alignItems: 'flex-start' },
  // minWidth:0 is load-bearing on react-native-web — without it a long title
  // inside a tile can push its column wider than its share.
  column: { flex: 1, minWidth: 0 },
  list: { paddingBottom: 132 },
  disclaimer: {
    fontSize: font.sm,
    lineHeight: 19,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  loader: { marginTop: spacing.xxl },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  emptyTitle: { textAlign: 'center' },
  emptyText: { textAlign: 'center', maxWidth: 380 },
  emptyCta: { marginTop: spacing.sm, alignSelf: 'stretch', maxWidth: 320 },

  bottomWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  bottomBar: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.ghostLine,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.ghostLine,
    height: 44,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontFamily: typeface.body,
    fontSize: font.md,
  },
}));
