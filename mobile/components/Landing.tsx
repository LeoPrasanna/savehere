import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Modal } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import { api, Reel } from '../services/api';
import { Pressable } from './Pressable';
import { Icon } from './Icon';
import { AuroraBackground } from './AuroraBackground';
import { ProfilePanel } from './ProfilePanel';
import { colors, spacing, font, radius, gradients, shadow } from '../constants/theme';
import { FEATURES, Feature } from '../constants/features';

// TODO: comes from the signed-in account once auth lands. Hardcoded for the draft.
const USER_NAME = 'Prasanna';
const TIER = 'Free';
// Surface "Ask your library" prominently once there's enough saved to answer from.
// Low bar: retrieval works on whatever's saved, and hiding it hurts discoverability.
const ASK_MIN_REELS = 3;

export function Landing({ onEnter }: { onEnter: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Feature | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Refetch whenever the Landing regains focus (e.g. returning after a save) so the
  // counts stay current — a plain useEffect([]) only runs once per mount.
  useFocusEffect(
    useCallback(() => {
      api.listReels().then(d => setReels(d.items)).catch(() => {}).finally(() => setLoading(false));
    }, [])
  );

  const total = reels.length;
  const categories = new Set(reels.map(r => r.category).filter(Boolean)).size;
  const platforms = new Set(reels.map(r => r.platform).filter(Boolean)).size;
  // When the Ask card is shown here, drop it from the menu so it isn't duplicated.
  const askCardVisible = !loading && total >= ASK_MIN_REELS;

  return (
    <View style={styles.screen}>
      <AuroraBackground />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.lg }]}
        showsVerticalScrollIndicator={false}
      >
        <MotiView from={{ opacity: 0, translateY: -10 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 450 }} style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hi}>Hi, {USER_NAME} 👋</Text>
            <Text style={styles.welcome}>Welcome to SaveHere</Text>
          </View>
          <Pressable style={styles.menuBtn} onPress={() => setMenuOpen(true)} scaleTo={0.9}>
            <Icon name="menu" size={22} color={colors.textPrimary} />
          </Pressable>
        </MotiView>

        <View style={styles.tierCard}>
          <LinearGradient colors={gradients.vibrant} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatar}>
            <Icon name="user" size={24} color="#FFF" />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={styles.tierName}>{USER_NAME}</Text>
            <Text style={styles.tierSub}>Saved on this device</Text>
          </View>
          <View style={styles.tierBadge}><Text style={styles.tierBadgeText}>{TIER}</Text></View>
        </View>

        <MotiView from={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', delay: 150, damping: 13 }} style={styles.heroStat}>
          {loading
            ? <ActivityIndicator color={colors.accent} size="large" />
            : <Text style={styles.heroNum}>{total}</Text>}
          <Text style={styles.heroLabel}>reels saved so far</Text>
          {!loading && total > 0 && (
            <Text style={styles.subStat}>across {categories} categories · {platforms} platforms</Text>
          )}
        </MotiView>

        {/* Prominent, gently pulsing add button */}
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

        {/* Highlighted once the library is big enough to answer from — not buried in the menu */}
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

        {/* Primary entry into the real library (☰ menu + grid) — right under Ask */}
        <Pressable style={styles.ctaWrap} onPress={onEnter} scaleTo={0.97}>
          <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cta}>
            <Icon name="bookmark" size={18} color="#FFF" />
            <Text style={styles.ctaText}>Open my library</Text>
          </LinearGradient>
        </Pressable>

        <View style={styles.upsell}>
          <Icon name="sparkles" size={16} color={colors.accentLight} />
          <Text style={styles.upsellText}>You're on the <Text style={styles.upsellStrong}>{TIER} tier</Text> — unlimited saves on this device. Pro plans coming soon.</Text>
        </View>

        {/* What you can do — save anything, turn it into action */}
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

  tierCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md,
  },
  avatar: { width: 48, height: 48, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', ...shadow.glow },
  tierName: { color: colors.textPrimary, fontSize: font.md, fontWeight: '800' },
  tierSub: { color: colors.textSecondary, fontSize: font.xs },
  tierBadge: { backgroundColor: colors.accent + '22', borderRadius: radius.full, paddingHorizontal: spacing.sm + 2, paddingVertical: 5 },
  tierBadgeText: { color: colors.accentLight, fontSize: font.xs, fontWeight: '800' },

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
