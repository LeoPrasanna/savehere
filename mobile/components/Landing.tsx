import { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Modal, Animated, Easing } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import { ArrowRight, Bookmark, Sparkles, Wand2 } from 'lucide-react-native';
import { api, Reel } from '../services/api';
import { Pressable } from './Pressable';
import { Icon } from './Icon';
import { AuroraBackground } from './AuroraBackground';
import { ProfilePanel } from './ProfilePanel';
import { FloatingParticleField } from './FloatingParticleField';
import { colors, spacing, font, radius, gradients, shadow, typeface } from '../constants/theme';
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

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  // Animate hero stat shimmer and pulse
  useState(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.03, duration: 1500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ])
    );
    pulse.start();

    const shimmer = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 3000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    shimmer.start();

    return () => { pulse.stop(); shimmer.stop(); };
  });

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

        {/* Animated Hero Stat Banner */}
        <Animated.View style={[styles.heroStat, { transform: [{ scale: pulseAnim }] }]}>
          <LinearGradient
            colors={['rgba(139,125,255,0.08)', 'rgba(91,192,255,0.04)', 'transparent']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {/* Animated shimmer bar */}
          <Animated.View
            style={[
              styles.shimmerBar,
              {
                transform: [{
                  translateX: shimmerAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-200, 400],
                  }),
                }],
              },
            ]}
          />
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
        </Animated.View>

        {/* Vibrant Save CTA */}
        <MotiView
          from={{ opacity: 0, scale: 0.9, translateY: 20 }}
          animate={{ opacity: 1, scale: 1, translateY: 0 }}
          transition={{ type: 'spring', delay: 120, damping: 13 }}
          style={styles.addWrap}
        >
          <Pressable onPress={() => router.push('/save')} scaleTo={0.96}>
            <LinearGradient colors={gradients.hologram} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.addBtn}>
              <Sparkles size={20} color="#FFF" />
              <Text style={styles.addText}>Save it to your second brain 🧠</Text>
              <ArrowRight size={20} color="#FFF" />
            </LinearGradient>
          </Pressable>
        </MotiView>

        {/* Quick tip */}
        <MotiView from={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 300, duration: 400 }} style={styles.quickTip}>
          <Wand2 size={14} color={colors.textTertiary} />
          <Text style={styles.quickTipText}>Pro tip: Tap any saved card to see the full AI summary, build a workout plan, or extract a recipe.</Text>
        </MotiView>

        {/* Vibrant Ask Your Library Card */}
        {askCardVisible && (
          <MotiView from={{ opacity: 0, translateY: 12 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'spring', delay: 200, damping: 14 }} style={styles.askWrap}>
            <Pressable onPress={() => router.push('/ask')} scaleTo={0.97}>
              <LinearGradient colors={gradients.hologram} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.askCard}>
                <LinearGradient
                  colors={['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.05)']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.askIcon}>
                  <Icon name="ask" size={22} color="#FFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.askTitle}>Ask your library ✨</Text>
                  <Text style={styles.askSub}>You've saved {total} reels — ask anything and get answers pulled straight from your own saves.</Text>
                </View>
                <MotiView
                  from={{ translateX: 0 }}
                  animate={{ translateX: [0, 4, 0] }}
                  transition={{ type: 'timing', duration: 1200, loop: true }}
                >
                  <ArrowRight size={20} color="rgba(255,255,255,0.95)" />
                </MotiView>
              </LinearGradient>
            </Pressable>
          </MotiView>
        )}

        {/* Vibrant Open Library CTA */}
        <MotiView from={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', delay: 280, damping: 14 }}>
          <Pressable style={styles.ctaWrap} onPress={onEnter} scaleTo={0.97}>
            <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cta}>
              <Bookmark size={18} color="#FFF" />
              <Text style={styles.ctaText}>Open my library</Text>
              <MotiView
                from={{ translateX: 0 }}
                animate={{ translateX: [0, 3, 0] }}
                transition={{ type: 'timing', duration: 1500, loop: true }}
              >
                <ArrowRight size={18} color="rgba(255,255,255,0.9)" />
              </MotiView>
            </LinearGradient>
          </Pressable>
        </MotiView>

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
  hi: { color: colors.textPrimary, fontFamily: typeface.display, fontSize: font.display, fontWeight: '900', letterSpacing: -1 },
  welcome: { color: colors.textSecondary, fontSize: font.lg, fontWeight: '600', marginTop: spacing.xs },

  heroStat: {
    alignItems: 'center',
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.xl,
    overflow: 'hidden',
    ...shadow.sm,
  },
  shimmerBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 120,
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.04)',
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
    overflow: 'hidden',
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
