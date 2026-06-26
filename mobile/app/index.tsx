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
import { Pressable } from '../components/Pressable';
import { Icon } from '../components/Icon';
import { AuroraBackground } from '../components/AuroraBackground';
import { ProfilePanel } from '../components/ProfilePanel';
import { Landing } from '../components/Landing';
import { colors, spacing, font, radius, gradients, shadow, categoryMeta, CATEGORY_OPTIONS } from '../constants/theme';

const CATEGORIES = ['all', ...CATEGORY_OPTIONS];
const PAGE = 24;   // library grid page size for infinite scroll

// Persists across screen remounts within a session (resets on app cold start),
// so the landing gate shows on launch but not every time you return home.
let enteredSession = false;

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
  const [entered, setEntered] = useState(enteredSession);

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

  // Append the next page when the grid nears its end (infinite scroll).
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
      // transient failure — keep what's loaded rather than blanking the grid
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, reels.length, total, activeCategory]);

  // Web: reflect the browser's online/offline state in a non-blocking banner.
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

  // Server-side search: debounce 400 ms, replaces the paginated list while active.
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

  // Summaries are generated in the background after save, so silently re-poll the
  // list while any card is still "pending" — they flip to the real summary without
  // a manual pull-to-refresh. Stops as soon as nothing is pending.
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

  // Pad the final row with invisible spacers so cards keep a uniform width.
  const fillers = displayList.length % numColumns === 0 ? 0 : numColumns - (displayList.length % numColumns);
  const gridData: any[] = fillers
    ? [...displayList, ...Array.from({ length: fillers }, (_, i) => ({ id: `__ghost_${i}`, __ghost: true }))]
    : displayList;

  // Entry gate: show the landing summary first; "Open my library" reveals the grid.
  if (!entered) {
    return <Landing onEnter={() => { enteredSession = true; setEntered(true); }} />;
  }

  return (
    <View style={styles.container}>
      <AuroraBackground />

      {/* ── Gradient header ─────────────────────────── */}
      <LinearGradient
        colors={gradients.primary}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + spacing.md }]}
      >
        <MotiView
          from={{ opacity: 0, translateY: -10 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 500 }}
          style={styles.headerTop}
        >
          <Pressable style={styles.brandRow} onPress={() => setEntered(false)} scaleTo={0.97}>
            <View style={styles.logoMark}>
              <LinearGradient
                colors={gradients.vibrant}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.logoMarkInner}
              >
                <Bookmark size={17} color="#FFF" fill="#FFF" />
              </LinearGradient>
              <View style={styles.logoSpark}>
                <Sparkles size={9} color={colors.accentDark} fill={colors.accentDark} />
              </View>
            </View>
            <View>
              <Text style={styles.brand}>SaveHere</Text>
              <Text style={styles.brandSub}>
                {total > 0 ? `${total} saved` : 'Your second brain for reels'}
              </Text>
            </View>
          </Pressable>
          <Pressable style={styles.menuBtn} onPress={() => setMenuOpen(true)} scaleTo={0.9}>
            <Icon name="menu" size={22} color="#FFF" />
          </Pressable>
        </MotiView>

        {/* Search */}
        <View style={styles.search}>
          <Search size={16} color={colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by title or tag…"
            placeholderTextColor={colors.textSecondary}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <XCircle size={16} color={colors.textSecondary} />
            </Pressable>
          )}
        </View>
      </LinearGradient>

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
              from={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', delay: 150 + index * 40, damping: 13, stiffness: 200 }}
            >
              <Pressable
                style={[
                  styles.categoryChip,
                  active && { backgroundColor: meta.color, borderColor: meta.color },
                ]}
                onPress={() => onCategoryChange(item)}
              >
                <Icon name={meta.icon} size={13} color={active ? '#FFF' : meta.color} />
                <Text style={[styles.categoryText, active && styles.categoryTextActive]}>
                  {item}
                </Text>
              </Pressable>
            </MotiView>
          );
        }}
      />

      {/* ── Content ─────────────────────────────────── */}
      {loading ? (
        <ActivityIndicator color={colors.accent} style={styles.loader} size="large" />
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
          <View style={styles.emptyIconWrap}>
            <Sparkles size={40} color={colors.accent} />
          </View>
          <Text style={styles.emptyTitle}>
            {inSearchMode ? 'No matches' : 'Nothing saved yet'}
          </Text>
          <Text style={styles.emptyText}>
            {inSearchMode ? `No results for "${search.trim()}".` : 'Tap the + button to save your first reel.'}
          </Text>
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

      {/* ── FAB ─────────────────────────────────────── */}
      <MotiView
        from={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', delay: 250, damping: 11, stiffness: 170 }}
        style={[styles.fab, { bottom: insets.bottom + spacing.lg }]}
      >
        <Pressable onPress={() => router.push('/save')} scaleTo={0.9}>
          <LinearGradient colors={gradients.vibrant} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fabInner}>
            <Plus size={30} color="#FFF" />
          </LinearGradient>
        </Pressable>
      </MotiView>

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
    paddingBottom: spacing.md,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    gap: spacing.md,
    ...shadow.md,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  menuBtn: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logoMark: { width: 40, height: 40 },
  logoMarkInner: {
    width: 40, height: 40, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
    ...shadow.sm,
  },
  logoSpark: {
    position: 'absolute', top: -4, right: -4,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: '#FFF',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#8B7DFF',
  },
  brand: { color: '#FFF', fontSize: font.xl, fontWeight: '800', letterSpacing: -0.5 },
  brandSub: { color: 'rgba(255,255,255,0.8)', fontSize: font.xs, fontWeight: '500' },

  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  searchInput: { flex: 1, color: '#FFF', fontSize: font.md },

  categoryList: { flexGrow: 0, height: 54, marginTop: spacing.sm },
  categoryContent: { paddingHorizontal: spacing.md, gap: spacing.sm, alignItems: 'center' },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryEmoji: { fontSize: 13 },
  categoryText: { color: colors.textSecondary, fontSize: font.xs, fontWeight: '600', textTransform: 'capitalize' },
  categoryTextActive: { color: '#FFF', fontWeight: '800' },

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
  emptyTitle: { color: colors.textPrimary, fontSize: font.lg, fontWeight: '700' },
  emptyText: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'center', lineHeight: 20 },

  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: 60, height: 60,
    borderRadius: radius.full,
    ...shadow.glow,
  },
  fabInner: {
    width: 60, height: 60,
    borderRadius: radius.full,
    alignItems: 'center', justifyContent: 'center',
  },
});
