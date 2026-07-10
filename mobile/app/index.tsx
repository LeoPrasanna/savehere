import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  RefreshControl, TextInput, useWindowDimensions, Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Bookmark, Search, XCircle, CloudOff, Sparkles, Plus } from 'lucide-react-native';
import { MotiView } from 'moti';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, Reel } from '../services/api';
import { ReelCard } from '../components/ReelCard';
import { SkeletonGrid } from '../components/SkeletonCard';
import { Pressable } from '../components/Pressable';
import { Icon } from '../components/Icon';
import { ProfilePanel } from '../components/ProfilePanel';
import { Landing } from '../components/Landing';
import { LibraryBackdrop } from '../components/LibraryBackdrop';
import { hasEnteredLibrary, markEnteredLibrary } from '../services/sessionFlags';
import { colors, spacing, font, radius, gradients, shadow, typeface, categoryMeta, CATEGORY_OPTIONS } from '../constants/theme';

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
  const [menuOpen, setMenuOpen] = useState(false);
  // Session-scoped (services/sessionFlags): remounts don't bounce back to the
  // landing, but a sign-out/sign-in resets it so new users start at Landing.
  const [entered, setEntered] = useState(hasEnteredLibrary());
  // Hairline under the header once content scrolls beneath it (iOS pattern).
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

  useEffect(() => {
    const q = search.trim();
    if (!q) { setSearchResults(null); setSearching(false); return; }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const data = await api.searchReels(q);
        setSearchResults(data.items);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

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

  const inSearchMode = search.trim().length > 0;
  const displayList = inSearchMode ? (searchResults ?? []) : reels;

  const fillers = displayList.length % numColumns === 0 ? 0 : numColumns - (displayList.length % numColumns);
  const gridData: any[] = fillers
    ? [...displayList, ...Array.from({ length: fillers }, (_, i) => ({ id: `__ghost_${i}`, __ghost: true }))]
    : displayList;

  if (!entered) {
    return <Landing onEnter={() => { markEnteredLibrary(); setEntered(true); }} />;
  }

  return (
    <View style={styles.container}>
      {/* Warm ambient backdrop: lively when the library is empty, whisper-quiet
          behind a populated grid so thumbnails stay the hero. */}
      <LibraryBackdrop mode={!loading && displayList.length === 0 ? 'full' : 'ambient'} />

      {/* ── Header — flat, iOS large-title ───────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }, scrolled && styles.headerScrolled]}>
        <MotiView
          from={{ opacity: 0, translateY: -6 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 350 }}
          style={styles.headerTop}
        >
          <Pressable style={styles.brandRow} onPress={() => setEntered(false)} scaleTo={0.97}>
            <LinearGradient
              colors={gradients.primary}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.logoMark}
            >
              <Bookmark size={15} color="#FFF" fill="#FFF" />
            </LinearGradient>
            <View>
              <Text style={styles.brand}>Library</Text>
              <Text style={styles.brandSub}>
                {total > 0 ? `${total} saved` : 'Your second brain for reels'}
              </Text>
            </View>
          </Pressable>
          <Pressable style={styles.menuBtn} onPress={() => setMenuOpen(true)} scaleTo={0.9}>
            <Icon name="menu" size={20} color={colors.textPrimary} />
          </Pressable>
        </MotiView>

        <View style={styles.search}>
          <Search size={15} color={colors.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search your saves…"
            placeholderTextColor={colors.textTertiary}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <XCircle size={15} color={colors.textTertiary} />
            </Pressable>
          )}
        </View>
      </View>

      {/* ── Category chips ──────────────────────────── */}
      <FlatList
        horizontal
        data={CATEGORIES}
        keyExtractor={c => c}
        showsHorizontalScrollIndicator={false}
        style={styles.categoryList}
        contentContainerStyle={styles.categoryContent}
        renderItem={({ item, index }) => {
          const active = activeCategory === item;
          const meta = categoryMeta[item] ?? categoryMeta.other;
          return (
            <MotiView
              from={{ opacity: 0, translateY: 6 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', delay: 60 + index * 25, duration: 250 }}
            >
              <Pressable
                style={[
                  styles.categoryChip,
                  active && { backgroundColor: meta.color + '26', borderColor: meta.color + '66' },
                ]}
                onPress={() => onCategoryChange(item)}
              >
                <Icon name={meta.icon} size={12} color={active ? meta.color : colors.textTertiary} />
                <Text style={[styles.categoryText, active && { color: meta.color, fontWeight: '700' }]}>
                  {item}
                </Text>
              </Pressable>
            </MotiView>
          );
        }}
      />

      {/* ── Content ─────────────────────────────────── */}
      {loading ? (
        <SkeletonGrid columns={numColumns} rows={3} />
      ) : error && reels.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <CloudOff size={40} color={colors.danger} />
          </View>
          <Text style={styles.emptyTitle}>Can't reach the server</Text>
          <Text style={styles.emptyText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => { setLoading(true); load(); }}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : searching ? (
        <ActivityIndicator color={colors.accent} style={styles.loader} size="large" />
      ) : displayList.length === 0 ? (
        <View style={styles.empty}>
          <MotiView
            from={{ translateY: 0 }}
            animate={{ translateY: -7 }}
            transition={{ type: 'timing', duration: 1600, loop: true, repeatReverse: true }}
            style={styles.emptyIconWrap}
          >
            <Sparkles size={40} color={colors.accent} />
          </MotiView>
          <Text style={styles.emptyTitle}>
            {inSearchMode ? 'No matches' : 'Nothing saved yet'}
          </Text>
          <Text style={styles.emptyText}>
            {inSearchMode ? `No results for "${search.trim()}".` : 'Save your first reel and the AI summary appears in seconds.'}
          </Text>
          {!inSearchMode && (
            <Pressable style={styles.emptyCtaWrap} onPress={() => router.push('/save')} scaleTo={0.96}>
              <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.emptyCta}>
                <Plus size={16} color="#FFF" />
                <Text style={styles.emptyCtaText}>Save your first reel</Text>
              </LinearGradient>
            </Pressable>
          )}
        </View>
      ) : (
        <>
        {(offline || error) && (
          <Pressable style={styles.banner} onPress={() => { setLoading(true); load(); }}>
            <Icon name="alert-circle" size={14} color="#FFF" />
            <Text style={styles.bannerText}>
              {offline ? "You're offline — changes may not save." : "Couldn't refresh — tap to retry."}
            </Text>
          </Pressable>
        )}
        <FlatList
          data={gridData}
          keyExtractor={(r: any) => r.id}
          numColumns={numColumns}
          key={numColumns}
          columnWrapperStyle={styles.row}
          renderItem={({ item, index }) => (
            item.__ghost
              ? <View style={styles.ghost} />
              : <ReelCard
                  reel={item}
                  index={index}
                  onDelete={id => { setReels(prev => prev.filter(r => r.id !== id)); setTotal(t => Math.max(0, t - 1)); }}
                />
          )}
          style={styles.grid}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onEndReached={inSearchMode ? undefined : loadMore}
          onEndReachedThreshold={0.6}
          onScroll={e => setScrolled(e.nativeEvent.contentOffset.y > 4)}
          scrollEventThrottle={32}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews={Platform.OS !== 'web'}
          ListFooterComponent={
            <>
              {loadingMore && <ActivityIndicator color={colors.accent} style={{ marginVertical: spacing.md }} />}
              <Text style={styles.disclaimer}>
                Summaries are generated by AI analysis and may be wrong or have gaps — you're free to edit them and add your own notes. All saved content belongs to its original creators.
              </Text>
            </>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              tintColor={colors.accent}
              colors={[colors.accent, colors.accentLight]}
              progressBackgroundColor={colors.card}
              title="Refreshing…"
              titleColor={colors.textSecondary}
            />
          }
        />
        </>
      )}

      {/* ── Save FAB ─────────────────────────────────── */}
      <View style={[styles.fab, { bottom: insets.bottom + spacing.lg }]}>
        <Pressable onPress={() => router.push('/save')} scaleTo={0.92}>
          <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fabInner}>
            <Plus size={28} color="#FFF" />
          </LinearGradient>
        </Pressable>
      </View>

      <ProfilePanel visible={menuOpen} onClose={() => setMenuOpen(false)} reels={reels} total={total} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  banner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.danger, paddingVertical: 8, paddingHorizontal: spacing.md,
  },
  bannerText: { color: '#FFF', fontSize: font.xs, fontWeight: '700' },
  retryBtn: {
    marginTop: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.accent,
  },
  retryText: { color: colors.accent, fontSize: font.sm, fontWeight: '700' },

  header: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.md,
    // Transparent so the ambient backdrop glows through; the container still
    // paints colors.background underneath everything.
    backgroundColor: 'transparent',
  },
  headerScrolled: { borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  menuBtn: {
    width: 38, height: 38, borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  logoMark: {
    width: 34, height: 34, borderRadius: radius.sm + 2,
    alignItems: 'center', justifyContent: 'center',
  },
  brand: { color: colors.textPrimary, fontFamily: typeface.display, fontSize: font.xxl, fontWeight: '800', letterSpacing: -0.7, lineHeight: 32 },
  brandSub: { color: colors.textTertiary, fontSize: font.xs, fontWeight: '500', marginTop: -2 },

  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 42,
  },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: font.md },

  categoryList: { flexGrow: 0, height: 48, marginTop: spacing.xs },
  categoryContent: { paddingHorizontal: spacing.md, gap: spacing.sm, alignItems: 'center' },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: 7,
    borderRadius: radius.full,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryText: { color: colors.textSecondary, fontSize: font.xs, fontWeight: '600', textTransform: 'capitalize' },

  grid: { flex: 1 },
  ghost: { flex: 1 },
  list: { padding: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.xxl },
  disclaimer: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center', paddingHorizontal: spacing.md, paddingTop: spacing.lg },
  row: { gap: spacing.sm },
  loader: { marginTop: spacing.xxl },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  emptyIconWrap: {
    width: 88, height: 88, borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: { color: colors.textPrimary, fontFamily: typeface.display, fontSize: font.lg, fontWeight: '700' },
  emptyText: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'center', lineHeight: 20 },
  emptyCtaWrap: { marginTop: spacing.md, borderRadius: radius.full, ...shadow.glow },
  emptyCta: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderRadius: radius.full, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 4,
  },
  emptyCtaText: { color: '#FFF', fontSize: font.sm, fontWeight: '700' },

  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: 58, height: 58,
    borderRadius: radius.full,
    ...shadow.glow,
  },
  fabInner: {
    width: 58, height: 58,
    borderRadius: radius.full,
    alignItems: 'center', justifyContent: 'center',
  },
});
