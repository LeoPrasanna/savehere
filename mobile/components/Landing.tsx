import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Modal, Platform } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import { Zap, Brain, TrendingUp, Bookmark, Wand2 } from 'lucide-react-native';
import { api, Reel } from '../services/api';
import { Pressable } from './Pressable';
import { Icon } from './Icon';
import { AuroraBackground } from './AuroraBackground';
import { ProfilePanel } from './ProfilePanel';
import { GlassCard } from './GlassCard';
import { HolographicShimmer } from './HolographicShimmer';
import { FloatingParticleField } from './FloatingParticleField';
import { colors, spacing, font, radius, gradients, shadow } from '../constants/theme';
import { useAuth } from '../contexts/AuthContext';
import { FEATURES, Feature } from '../constants/features';

const TIER = 'Free';
const ASK_MIN_REELS = 3;

export function Landing({ onEnter }: { onEnter: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { email, displayName: userName } = useAuth();
  const [reels, setReels] = useState<Reel[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [selected, setSelected] = useState<Feature | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setFetchError(false);
      api.listReels()
        .then(d => { setReels(d.items); setTotal(d.total); })
        .catch(() => setFetchError(true))
        .finally(() => setLoading(false));
    }, [])
  );

  const categories = new Set(reels.map(r => r.category).filter(Boolean)).size;
  const platforms = new Set(reels.map(r => r.platform).filter(Boolean)).size;
  const askCardVisible = !loading && total >= ASK_MIN_REELS;

  // AI Insight stats
  const recentSaves = reels.filter(r => {
    const days = (Date.now() - new Date(r.created_at).getTime()) / (1000 * 60 * 60 * 24);
    return days <= 7;
  }).length;

  const topCategory = reels.reduce((acc, r) => {
    if (!r.category) return acc;
    acc[r.category] = (acc[r.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const topCat = Object.entries(topCategory).sort((a, b) => b[1] - a[1])[0]?.[0];

  return (
    <View style={styles.screen}>
      <FloatingParticleField />
      <AuroraBackground />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.lg }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <MotiView from={{ opacity: 0, translateY: -10 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 450 }} style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hi}>Hi, {userName} 👋</Text>
            <Text style={styles.welcome}>Welcome to SaveHere</Text>
          </View>
          <Pressable style={styles.menuBtn} onPress={() => setMenuOpen(true)} scaleTo={0.9}>
            <Icon name="menu" size={22} color={colors.textPrimary} />
          </Pressable>
        </MotiView>

        {/* AI Insight Dashboard */}
        {!loading && !fetchError && total > 0 && (
          <MotiView from={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', delay: 100, damping: 14 }}>
            <GlassCard tint="violet" intensity="medium" style={styles.insightCard}>
              <HolographicShimmer width={400} height={80} color="rgba(139,125,255,0.08)" duration={3500} delay={500} />
              <View style={styles.insightHeader}>
                <View style={styles.insightIconWrap}>
                  <Brain size={18} color={colors.accentLight} />
                </View>
                <Text style={styles.insightTitle}>AI Insights</Text>
              </View>
              <View style={styles.insightGrid}>
                <View style={styles.insightCell}>
                  <Text style={styles.insightNum}>{total}</Text>
                  <Text style={styles.insightLabel}>Total saves</Text>
                </View>
                <View style={styles.insightCell}>
                  <Text style={styles.insightNum}>{recentSaves}</Text>
                  <Text style={styles.insightLabel}>This week</Text>
                </View>
                <View style={styles.insightCell}>
                  <Text style={styles.insightNum}>{categories}</Text>
                  <Text style={styles.insightLabel}>Categories</Text>
                </View>
                {topCat && (
                  <View style={styles.insightCell}>
                    <Text style={styles.insightNum}>{topCat}</Text>
                    <Text style={styles.insightLabel}>Top interest</Text>
                  </View>
                )}
              </View>
            </GlassCard>
          </MotiView>
        )}

        {/* Smart Collections Preview */}
        {!loading && !fetchError && total >= 5 && (
          <MotiView from={{ opacity: 0, translateY: 12 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', delay: 200, duration: 450 }}>
            <GlassCard tint="cyan" intensity="low" style={styles.collectionsCard}>
              <View style={styles.collectionsHeader}>
                <View style={styles.collectionsIconWrap}>
                  <Zap size={16} color={colors.hologram} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.collectionsTitle}>Smart Collections</Text>
                  <Text style={styles.collectionsSub}>AI auto-groups your saves by topic</Text>
                </View>
                <TrendingUp size={16} color={colors.success} />
              </View>
              <View style={styles.collectionChips}>
                {Object.entries(topCategory).slice(0, 3).map(([cat, count]) => (
                  <View key={cat} style={styles.collectionChip}>
                    <Text style={styles.collectionChipText}>{cat} · {count}</Text>
                  </View>
                ))}
                <View style={[styles.collectionChip, styles.collectionChipMore]}>
                  <Text style={styles.collectionChipMoreText}>+{Object.keys(topCategory).length - 3} more</Text>
                </View>
              </View>
            </GlassCard>
          </MotiView>
        )}

        {/* Hero stat */}
        <MotiView from={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', delay: 150, damping: 13 }} style={styles.heroStat}>
          {loading
            ? <ActivityIndicator color={colors.accent} size="large" />
            : fetchError
              ? <Text style={styles.heroNum}>–</Text>
              : <Text style={styles.heroNum}>{total}</Text>}
          <Text style={styles.heroLabel}>reels saved so far</Text>
          {fetchError
            ? <Text style={styles.subStat}>Can't reach server</Text>
            : !loading && total > 0
              ? <Text style={styles.subStat}>across {categories} categories · {platforms} platforms</Text>
              : null}
        </MotiView>

        {/* Pulsing save button */}
        <MotiView
          from={{ scale: 1 }}
          animate={{ scale: 1.035 }}
          transition={{ type: 'timing', duration: 1200, loop: true, repeatReverse: true }}
          style={styles.addWrap}
        >
          <Pressable onPress={() => router.push('/save')} scaleTo={0.96}>
            <LinearGradient colors={gradients.vibrant} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.addBtn}>
              <Icon name="add" size={22} color="#FFF" />
              <Text style={styles.addText}>Save it to your second brain 🧠</Text>
            </LinearGradient>
          </Pressable>
        </MotiView>

        {/* Quick tip */}
        <MotiView from={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 300, duration: 400 }} style={styles.quickTip}>
          <Wand2 size={14} color={colors.textTertiary} />
          <Text style={styles.quickTipText}>Pro tip: Tap any saved card to see the full AI summary, build a workout plan, or extract a recipe.</Text>
        </MotiView>

        {/* Ask card */}
        {askCardVisible && (
          <MotiView from={{ opacity: 0, translateY: 12 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', delay: 220, duration: 450 }} style={styles.askWrap}>
            <Pressable onPress={() => router.push('/ask')} scaleTo={0.97}>
              <LinearGradient colors={gradients.cool} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.askCard}>
                <View style={styles.askIcon}>
                  <Icon name="ask" size={22} color="#FFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.askTitle}>Ask your library ✨</Text>
                  <Text style={styles.askSub}>You've saved {total} reels — ask anything and get answers pulled straight from your own saves.</Text>
                </View>
                <Icon name="arrow-forward" size={18} color="rgba(255,255,255,0.95)" />
              </LinearGradient>
            </Pressable>
          </MotiView>
        )}

        {/* Open library */}
        <Pressable style={styles.ctaWrap} onPress={onEnter} scaleTo={0.97}>
          <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cta}>
            <Bookmark size={18} color="#FFF" />
            <Text style={styles.ctaText}>Open my library</Text>
          </LinearGradient>
        </Pressable>

        <View style={styles.upsell}>
          <Icon name="sparkles" size={16} color={colors.accentLight} />
          <Text style={styles.upsellText}>You're on the <Text style={styles.upsellStrong}>{TIER} tier</Text> — unlimited saves, synced to your account. Pro plans coming soon.</Text>
        </View>

        {/* Features */}
        <View style={styles.features}>
          <Text style={styles.sectionLabel}>WHAT YOU CAN DO · tap to learn more</Text>
          {FEATURES.map(f => (
            <Pressable key={f.title} style={styles.feature} onPress={() => setSelected(f)} scaleTo={0.98}>
              <View style={[styles.featureIcon, { backgroundColor: f.color + '22' }]}>
                <Icon name={f.icon} size={18} color={f.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureDesc}>{f.desc}</Text>
              </View>
              <Icon name="chevron-right" size={16} color={colors.textTertiary} />
            </Pressable>
          ))}
        </View>

        <View style={{ flex: 1, minHeight: spacing.lg }} />

        <Text style={styles.disclaimer}>
          Summaries are generated by AI analysis and may be wrong or have gaps in understanding — you're free to
          edit them and add your own notes anytime. All saved content belongs to its original creators; SaveHere
          stores links and summaries for personal reference only.
        </Text>
      </ScrollView>

      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)} statusBarTranslucent>
        <Pressable style={styles.modalOverlay} onPress={() => setSelected(null)} scaleTo={1}>
          {selected && (
            <MotiView
              from={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', damping: 15 }}
            >
              <Pressable scaleTo={1} onPress={() => {}} style={styles.modalCard}>
                <View style={[styles.modalIcon, { backgroundColor: selected.color + '22' }]}>
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
        showAsk={!askCardVisible}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, paddingHorizontal: spacing.lg, gap: spacing.lg },

  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  menuBtn: {
    width: 44, height: 44, borderRadius: radius.full,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  hi: { color: colors.textPrimary, fontSize: font.display, fontWeight: '900', letterSpacing: -1 },
  welcome: { color: colors.textSecondary, fontSize: font.lg, fontWeight: '600', marginTop: spacing.xs },

  // AI Insights
  insightCard: { padding: spacing.md, gap: spacing.sm },
  insightHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  insightIconWrap: {
    width: 32, height: 32, borderRadius: radius.full,
    backgroundColor: colors.accent + '22',
    alignItems: 'center', justifyContent: 'center',
  },
  insightTitle: { color: colors.accentLight, fontSize: font.sm, fontWeight: '800', letterSpacing: 0.5 },
  insightGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  insightCell: { flex: 1, minWidth: 60, alignItems: 'center' },
  insightNum: { color: colors.textPrimary, fontSize: font.lg, fontWeight: '900' },
  insightLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: '600', marginTop: 2 },

  // Smart Collections
  collectionsCard: { padding: spacing.md, gap: spacing.sm },
  collectionsHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  collectionsIconWrap: {
    width: 32, height: 32, borderRadius: radius.full,
    backgroundColor: colors.hologram + '22',
    alignItems: 'center', justifyContent: 'center',
  },
  collectionsTitle: { color: colors.textPrimary, fontSize: font.sm, fontWeight: '800' },
  collectionsSub: { color: colors.textSecondary, fontSize: font.xs, marginTop: 1 },
  collectionChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.xs },
  collectionChip: {
    backgroundColor: colors.card,
    borderRadius: radius.full,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: colors.border,
  },
  collectionChipText: { color: colors.textSecondary, fontSize: 10, fontWeight: '700' },
  collectionChipMore: { borderColor: colors.accent + '40', backgroundColor: colors.accent + '12' },
  collectionChipMoreText: { color: colors.accentLight, fontSize: 10, fontWeight: '700' },

  heroStat: {
    alignItems: 'center',
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.xl,
    ...shadow.sm,
  },
  heroNum: { color: colors.accent, fontSize: 64, fontWeight: '900', lineHeight: 68 },
  heroLabel: { color: colors.textPrimary, fontSize: font.md, fontWeight: '700', marginTop: spacing.xs },
  subStat: { color: colors.textSecondary, fontSize: font.sm, marginTop: spacing.xs },

  upsell: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    backgroundColor: colors.accent + '14', borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.accent + '33', padding: spacing.md,
  },
  upsellText: { flex: 1, color: colors.textSecondary, fontSize: font.sm, lineHeight: 20 },
  upsellStrong: { color: colors.accentLight, fontWeight: '800' },

  features: { gap: spacing.sm },
  sectionLabel: { color: colors.textSecondary, fontSize: font.xs, fontWeight: '800', letterSpacing: 1, marginBottom: spacing.xs },
  feature: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: spacing.sm + 2,
  },
  featureIcon: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  featureTitle: { color: colors.textPrimary, fontSize: font.sm, fontWeight: '700' },
  featureDesc: { color: colors.textSecondary, fontSize: font.xs, lineHeight: 16 },

  ctaWrap: { borderRadius: radius.md, ...shadow.glow },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    borderRadius: radius.md, padding: spacing.md, minHeight: 54,
  },
  ctaText: { color: '#FFF', fontSize: font.md, fontWeight: '800' },

  disclaimer: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center' },

  addWrap: { borderRadius: radius.md, ...shadow.glow },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    borderRadius: radius.md, paddingVertical: spacing.md, minHeight: 54,
  },
  addText: { color: '#FFF', fontSize: font.md, fontWeight: '800' },

  quickTip: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.sm, opacity: 0.8,
  },
  quickTipText: { flex: 1, color: colors.textTertiary, fontSize: font.xs, lineHeight: 16, fontStyle: 'italic' },

  askWrap: { borderRadius: radius.lg, ...shadow.md },
  askCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderRadius: radius.lg, padding: spacing.md,
  },
  askIcon: {
    width: 42, height: 42, borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  askTitle: { color: '#FFF', fontSize: font.md, fontWeight: '800' },
  askSub: { color: 'rgba(255,255,255,0.92)', fontSize: font.xs, lineHeight: 16, marginTop: 2 },

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
  modalTitle: { color: colors.textPrimary, fontSize: font.lg, fontWeight: '800', textAlign: 'center' },
  modalDetail: { color: colors.textSecondary, fontSize: font.sm, lineHeight: 21, textAlign: 'center' },
  modalBtnWrap: { width: '100%', borderRadius: radius.md, marginTop: spacing.sm, ...shadow.glow },
  modalBtn: { borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  modalBtnText: { color: '#FFF', fontSize: font.md, fontWeight: '800' },
});
