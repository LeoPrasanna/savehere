import { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Modal, Image, Animated } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import { Plus } from 'lucide-react-native';
import { api, thumbUrl, Reel } from '../services/api';
import { Pressable } from './Pressable';
import { Icon } from './Icon';
import { AuroraBackground } from './AuroraBackground';
import { ProfilePanel } from './ProfilePanel';
import { colors, spacing, font, radius, gradients, shadow, typeface, themed } from '../constants/theme';
import { useAuth } from '../contexts/AuthContext';
import { consumeReopenPanel } from '../services/sessionFlags';
import { FEATURES, Feature } from '../constants/features';
import { RollingTagline } from './RollingTagline';
import { ASK_MIN_REELS } from '../constants/limits';

// How many saves the home screen shows before handing off to the full library.
const RECENT_LIMIT = 10;
/** Carousel card width — also the snap interval, so scrolling settles on a card. */
const RECENT_CARD_W = 150;
/** Only fetch what this screen renders. The landing used to pull 24 reels for a
 *  list it never showed; the carousel needs a fraction of that, and a smaller
 *  payload is the whole reason the home screen now appears faster. */
const LANDING_FETCH = 12;

/** One card in the recent carousel. A horizontal strip beats a vertical list
 *  here: it shows the thumbnail at a size worth looking at, and it costs a fixed
 *  slice of screen no matter how many saves exist — a list pushed everything
 *  below it off the page. */
function RecentCard({ reel, onPress }: { reel: Reel; onPress: () => void }) {
  const thumb = thumbUrl(reel.thumbnail_url);
  const pending = reel.summary_status === 'pending';
  return (
    <Pressable style={styles.recentCard} onPress={onPress} scaleTo={0.97}>
      {thumb ? (
        <Image source={{ uri: thumb }} style={styles.recentCover} resizeMode="cover" />
      ) : (
        <View style={[styles.recentCover, styles.recentCoverEmpty]}>
          <Icon name={reel.category || 'other'} size={20} color={colors.textTertiary} />
        </View>
      )}
      <Text style={styles.recentTitle} numberOfLines={2}>{reel.title || 'Untitled save'}</Text>
      {pending ? (
        <Text style={styles.recentPending} numberOfLines={1}>Summarizing…</Text>
      ) : reel.category ? (
        <Text style={styles.recentCat} numberOfLines={1}>{reel.category}</Text>
      ) : null}
    </Pressable>
  );
}

/** Placeholder carousel shown while the first fetch is in flight, so the screen
 *  isn't just the greeting + a "Save a reel" button over dead space. A gentle
 *  opacity pulse; it unmounts the instant real content (or the empty state) lands. */
function RecentSkeleton() {
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 750, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <View style={styles.recentBlock}>
      <Animated.View style={[styles.skelLine, { width: 84, opacity: pulse }]} />
      <ScrollView horizontal scrollEnabled={false} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentStrip}>
        {[0, 1, 2, 3].map(i => (
          <Animated.View key={i} style={[styles.recentCard, { opacity: pulse }]}>
            <View style={styles.recentCover} />
            <View style={[styles.skelLine, { width: '85%', marginTop: spacing.xs }]} />
            <View style={[styles.skelLine, { width: '50%', marginTop: 4 }]} />
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
  const [selected, setSelected] = useState<Feature | null>(null);
  const [catFilter, setCatFilter] = useState<string | null>(null);
  // Reopens after an accent switch remounts the tree (one-shot session flag).
  const [menuOpen, setMenuOpen] = useState(consumeReopenPanel());
  // Whole-library category count for the greeting — the loaded page is only a
  // sample, so counting it undercounts. null until the server answers.
  const [libCategories, setLibCategories] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      setFetchError(false);
      api.listReels({ limit: LANDING_FETCH })
        .then(d => { setReels(d.items); setTotal(d.total); })
        .catch(() => setFetchError(true))
        .finally(() => setLoading(false));
      api.getUsage().then(u => setLibCategories(u.categories ?? null)).catch(() => {});
    }, [])
  );

  const categories = libCategories ?? new Set(reels.map(r => r.category).filter(Boolean)).size;
  const askVisible = !loading && total >= ASK_MIN_REELS;
  const hasSaves = !loading && !fetchError && total > 0;

  // Three states, one screen. Anything that can't justify itself at 50+ saves is
  // a first-run element and lives in `firstRun` only — that's exactly how the old
  // "What you can do" list became permanent furniture.
  const firstRun = !loading && !fetchError && total === 0;
  const learning = hasSaves && total < ASK_MIN_REELS;

  // Category chips filter the already-fetched page locally — no extra request,
  // and no filter state to hand off to the library screen.
  const catList = Array.from(new Set(reels.map(r => r.category).filter(Boolean))) as string[];
  const visible = catFilter ? reels.filter(r => r.category === catFilter) : reels;
  const recent = visible.slice(0, RECENT_LIMIT);

  return (
    <View style={styles.screen}>
      <AuroraBackground />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + 92 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Greeting ─────────────────────────────────── */}
        <MotiView from={{ opacity: 0, translateY: -8 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 400 }} style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hi}>Hi, {userName}.</Text>
            <Text style={styles.welcome}>
              {fetchError
                ? "Can't reach the server right now."
                : hasSaves
                  ? <>You've kept <Text style={styles.welcomeStrong}>{total}</Text> {total === 1 ? 'reel' : 'reels'}{categories > 1 ? <> across <Text style={styles.welcomeStrong}>{categories}</Text> categories</> : null}.</>
                  : 'Your second brain for short-form content.'}
            </Text>
          </View>
          <Pressable style={styles.menuBtn} onPress={() => setMenuOpen(true)} scaleTo={0.9}>
            <Icon name="menu" size={20} color={colors.textPrimary} />
          </Pressable>
        </MotiView>

        {/* Loading — a shaped placeholder so the fetch gap isn't dead space. */}
        {loading && <RecentSkeleton />}

        {/* ── FIRST RUN (0 saves) ──────────────────────────
            "What you can do" lives HERE and only here. With nothing to show, the
            job of the screen is to explain the payoff — which is what this copy
            was always for. It disappears the moment there's real content. */}
        {firstRun && (
          <MotiView
            from={{ opacity: 0, translateY: 10 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 300, delay: 180 }}
            style={styles.features}
          >
            <Text style={styles.sectionLabel}>WHAT A SAVE BECOMES</Text>
            {FEATURES.map(f => (
              <Pressable key={f.title} style={styles.feature} onPress={() => setSelected(f)} scaleTo={0.98}>
                <View style={[styles.featureIcon, { backgroundColor: f.color + '1E' }]}>
                  <Icon name={f.icon} size={17} color={f.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.featureTitle}>{f.title}</Text>
                  <Text style={styles.featureDesc}>{f.desc}</Text>
                </View>
                <Icon name="chevron-right" size={15} color={colors.textTertiary} />
              </Pressable>
            ))}
          </MotiView>
        )}

        {/* ── LEARNING (1 .. ASK_MIN_REELS-1) ──────────────
            Exactly one tip, and it's progress toward something real — not a
            brochure. Same threshold as the Ask unlock. */}
        {learning && (
          <MotiView
            from={{ opacity: 0, translateY: 10 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 300, delay: 160 }}
            style={styles.progressCard}
          >
            <Text style={styles.progressTitle}>
              Save {ASK_MIN_REELS - total} more to unlock Ask your library
            </Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${(total / ASK_MIN_REELS) * 100}%` }]} />
            </View>
            <Text style={styles.progressSub}>
              Ask answers from your own saves — it works best with a few to draw on.
            </Text>
          </MotiView>
        )}

        {/* ── Ask — above the categories/recent so it's the first thing after
            the greeting once unlocked (owner: bring Ask up above categories). ── */}
        {askVisible && (
          <MotiView from={{ opacity: 0, translateY: 10 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 300, delay: 150 }}>
            <Pressable style={styles.quietRow} onPress={() => router.push('/ask')} scaleTo={0.98}>
              <View style={[styles.quietIcon, { backgroundColor: colors.neonCyan + '1A' }]}>
                <Icon name="ask" size={18} color={colors.neonCyan} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.quietTitle}>Ask your library</Text>
                <Text style={styles.quietSub}>Answers pulled straight from your own saves.</Text>
              </View>
              <Icon name="chevron-right" size={16} color={colors.textTertiary} />
            </Pressable>
          </MotiView>
        )}

        {/* ── YOUR SAVES — the reason this screen exists ─── */}
        {hasSaves && (
          <MotiView
            from={{ opacity: 0, translateY: 10 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 300, delay: 200 }}
            style={styles.recentBlock}
          >
            {catList.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                <Pressable
                  style={[styles.chip, !catFilter && styles.chipOn]}
                  onPress={() => setCatFilter(null)}
                  scaleTo={0.96}
                >
                  <Text style={[styles.chipText, !catFilter && styles.chipTextOn]}>All</Text>
                </Pressable>
                {catList.map(c => (
                  <Pressable
                    key={c}
                    style={[styles.chip, catFilter === c && styles.chipOn]}
                    onPress={() => setCatFilter(catFilter === c ? null : c)}
                    scaleTo={0.96}
                  >
                    <Text style={[styles.chipText, catFilter === c && styles.chipTextOn]}>{c}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}

            <Text style={styles.sectionLabel}>{catFilter ? catFilter.toUpperCase() : 'RECENT'}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recentStrip}
              // Snap to card width so the carousel settles on a card, not mid-cut.
              snapToInterval={RECENT_CARD_W + spacing.sm}
              decelerationRate="fast"
            >
              {recent.map(r => (
                <RecentCard key={r.id} reel={r} onPress={() => router.push(`/reel/${r.id}`)} />
              ))}
            </ScrollView>
          </MotiView>
        )}

        {/* Rolling tips — the same benefit lines that roll on the auth screen. */}
        {!loading && <RollingTagline style={styles.tips} />}

        <View style={{ flex: 1, minHeight: spacing.lg }} />

        <Text style={styles.disclaimer}>
          Summaries are generated by AI and may be wrong or have gaps — add details in Notes and re-summarize to correct one.
          Saved content belongs to its original creators; SaveHere keeps links and summaries for personal reference only.
        </Text>
      </ScrollView>

      {/* ── Fixed bottom bar: Library + Save ─────────────── */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.sm }]}>
        <Pressable style={styles.bottomLibrary} onPress={onEnter} scaleTo={0.96}>
          <Icon name="bookmark" size={18} color={colors.textPrimary} />
          <Text style={styles.bottomLibraryText}>Library</Text>
        </Pressable>
        <Pressable style={styles.bottomSaveWrap} onPress={() => router.push('/save')} scaleTo={0.96}>
          <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.bottomSave}>
            <Plus size={18} color="#FFF" />
            <Text style={styles.bottomSaveText}>Save</Text>
          </LinearGradient>
        </Pressable>
      </View>

      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)} statusBarTranslucent>
        <Pressable style={styles.modalOverlay} onPress={() => setSelected(null)} scaleTo={1}>
          {selected && (
            <MotiView
              from={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'timing', duration: 220 }}
            >
              <Pressable scaleTo={1} onPress={() => {}} style={styles.modalCard}>
                <View style={[styles.modalIcon, { backgroundColor: selected.color + '1E' }]}>
                  <Icon name={selected.icon} size={26} color={selected.color} />
                </View>
                <Text style={styles.modalTitle}>{selected.title}</Text>
                <Text style={styles.modalDetail}>{selected.detail}</Text>
                <Pressable style={styles.modalBtnWrap} onPress={() => setSelected(null)} scaleTo={0.97}>
                  <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.modalBtn}>
                    <Text style={styles.modalBtnText}>Got it</Text>
                  </LinearGradient>
                </Pressable>
              </Pressable>
            </MotiView>
          )}
        </Pressable>
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
  content: { flexGrow: 1, paddingHorizontal: spacing.lg, gap: spacing.lg },

  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  menuBtn: {
    width: 42, height: 42, borderRadius: radius.full,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  hi: { color: colors.textPrimary, fontFamily: typeface.serifBlack, fontSize: font.display, lineHeight: 42, letterSpacing: -0.5 },
  welcome: { color: colors.textSecondary, fontSize: font.lg, lineHeight: 24, marginTop: spacing.sm },
  welcomeStrong: { color: colors.accentLight, fontFamily: typeface.displaySemi, fontWeight: '700' },

  sectionLabel: { color: colors.textTertiary, fontSize: font.xs, fontWeight: '800', letterSpacing: 1.2 },

  // ── Fixed bottom bar ────────────────────────────────────────────────
  bottomBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm,
    backgroundColor: colors.background,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  bottomLibrary: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, height: 50,
  },
  bottomLibraryText: { color: colors.textPrimary, fontSize: font.md, fontWeight: '700' },
  bottomSaveWrap: { flex: 1, borderRadius: radius.md, ...shadow.glow },
  bottomSave: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    borderRadius: radius.md, height: 50,
  },
  bottomSaveText: { color: '#FFF', fontSize: font.md, fontWeight: '800' },

  quietRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2,
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md,
  },
  quietIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  quietTitle: { color: colors.textPrimary, fontSize: font.md, fontWeight: '700' },
  quietSub: { color: colors.textSecondary, fontSize: font.xs, marginTop: 1 },

  // ── Library-first home ──────────────────────────────────────────────
  recentBlock: { gap: spacing.sm },
  tips: { marginTop: spacing.xs },

  chipRow: { gap: spacing.xs, paddingVertical: 2 },
  chip: {
    paddingHorizontal: spacing.sm + 2, paddingVertical: 6, borderRadius: radius.full,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.accent + '24', borderColor: colors.accent },
  chipText: { color: colors.textSecondary, fontSize: font.xs, fontWeight: '600', textTransform: 'capitalize' },
  chipTextOn: { color: colors.accentLight },

  skelLine: { height: 11, borderRadius: 5, backgroundColor: colors.cardElevated },
  recentStrip: { gap: spacing.sm, paddingRight: spacing.lg },
  recentCard: { width: RECENT_CARD_W },
  recentCover: {
    width: RECENT_CARD_W, height: 94, borderRadius: radius.md,
    backgroundColor: colors.cardElevated,
    borderWidth: 1, borderColor: colors.border,
  },
  recentCoverEmpty: { alignItems: 'center', justifyContent: 'center' },
  recentTitle: {
    color: colors.textPrimary, fontSize: font.xs, fontWeight: '700',
    lineHeight: 16, marginTop: spacing.xs,
  },
  recentCat: { color: colors.textTertiary, fontSize: 10, marginTop: 2, textTransform: 'capitalize' },
  recentPending: { color: colors.textTertiary, fontSize: 10, marginTop: 2, fontStyle: 'italic' },

  progressCard: {
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.xs,
  },
  progressTitle: { color: colors.textPrimary, fontSize: font.sm, fontWeight: '700' },
  progressTrack: {
    height: 5, borderRadius: radius.full, backgroundColor: colors.border, overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: radius.full, backgroundColor: colors.accent },
  progressSub: { color: colors.textSecondary, fontSize: font.xs, lineHeight: 16 },

  features: { gap: spacing.sm },
  feature: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: spacing.sm + 2,
  },
  featureIcon: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  featureTitle: { color: colors.textPrimary, fontSize: font.sm, fontWeight: '700' },
  featureDesc: { color: colors.textSecondary, fontSize: font.xs, lineHeight: 16 },

  disclaimer: { color: colors.textTertiary, fontSize: 12, lineHeight: 18, textAlign: 'center' },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', padding: spacing.lg,
  },
  modalCard: {
    width: '100%', maxWidth: 400,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.lg,
    alignItems: 'center', gap: spacing.sm, ...shadow.md,
  },
  modalIcon: {
    width: 56, height: 56, borderRadius: radius.lg,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs,
  },
  modalTitle: { color: colors.textPrimary, fontFamily: typeface.display, fontSize: font.lg, fontWeight: '800', textAlign: 'center' },
  modalDetail: { color: colors.textSecondary, fontSize: font.sm, lineHeight: 21, textAlign: 'center' },
  modalBtnWrap: { width: '100%', borderRadius: radius.md, marginTop: spacing.sm },
  modalBtn: { borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  modalBtnText: { color: '#FFF', fontSize: font.md, fontWeight: '800' },
}));
