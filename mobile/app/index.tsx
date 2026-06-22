import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  RefreshControl, TextInput, useWindowDimensions,
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

// Persists across screen remounts within a session (resets on app cold start),
// so the landing gate shows on launch but not every time you return home.
let enteredSession = false;

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const numColumns = width < 600 ? 2 : width < 1024 ? 3 : 4;
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [entered, setEntered] = useState(enteredSession);

  const load = useCallback(async (category = activeCategory) => {
    try {
      setError('');
      const filters = category !== 'all' ? { category } : undefined;
      const data = await api.listReels(filters);
      setReels(data.items);
    } catch (e: any) {
      setError('Could not connect to backend. Make sure the server is running on port 8000.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeCategory]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const onCategoryChange = (cat: string) => {
    setActiveCategory(cat);
    setLoading(true);
    load(cat);
  };

  const q = search.trim().toLowerCase();
  const filtered = q
    ? reels.filter(r =>
        (r.title || '').toLowerCase().includes(q) ||
        r.tags.some(t => t.toLowerCase().includes(q)) ||
        (r.summary || []).some(s => s.toLowerCase().includes(q)) ||
        (r.notes || '').toLowerCase().includes(q)
      )
    : reels;

  // Pad the final row with invisible spacers so cards keep a uniform width.
  const fillers = filtered.length % numColumns === 0 ? 0 : numColumns - (filtered.length % numColumns);
  const gridData: any[] = fillers
    ? [...filtered, ...Array.from({ length: fillers }, (_, i) => ({ id: `__ghost_${i}`, __ghost: true }))]
    : filtered;

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
                {reels.length > 0 ? `${reels.length} saved` : 'Your second brain for reels'}
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
      ) : error ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <CloudOff size={40} color={colors.danger} />
          </View>
          <Text style={styles.emptyTitle}>Can't reach the server</Text>
          <Text style={styles.emptyText}>{error}</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Sparkles size={40} color={colors.accent} />
          </View>
          <Text style={styles.emptyTitle}>
            {search ? 'No matches' : 'Nothing saved yet'}
          </Text>
          <Text style={styles.emptyText}>
            {search ? 'Try a different search.' : 'Tap the + button to save your first reel.'}
          </Text>
        </View>
      ) : (
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
                  onDelete={id => setReels(prev => prev.filter(r => r.id !== id))}
                />
          )}
          style={styles.grid}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            <Text style={styles.disclaimer}>
              Summaries are generated by AI analysis and may be wrong or have gaps — you're free to edit them and add your own notes. All saved content belongs to its original creators.
            </Text>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              tintColor={colors.accent}
            />
          }
        />
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

      <ProfilePanel visible={menuOpen} onClose={() => setMenuOpen(false)} reels={reels} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

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
