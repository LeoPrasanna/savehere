import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Modal } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import { ArrowRight, Plus } from 'lucide-react-native';
import { api, Reel } from '../services/api';
import { Pressable } from './Pressable';
import { Icon } from './Icon';
import { AuroraBackground } from './AuroraBackground';
import { ProfilePanel } from './ProfilePanel';
import { colors, spacing, font, radius, gradients, shadow, typeface } from '../constants/theme';
import { useAuth } from '../contexts/AuthContext';
import { FEATURES, Feature } from '../constants/features';

const ASK_MIN_REELS = 3;

export function Landing({ onEnter }: { onEnter: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { displayName: userName } = useAuth();
  const [reels, setReels] = useState<Reel[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [selected, setSelected] = useState<Feature | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setFetchError(false);
      api.listReels({ limit: 24 })
        .then(d => { setReels(d.items); setTotal(d.total); })
        .catch(() => setFetchError(true))
        .finally(() => setLoading(false));
    }, [])
  );

  const categories = new Set(reels.map(r => r.category).filter(Boolean)).size;
  const askVisible = !loading && total >= ASK_MIN_REELS;
  const hasSaves = !loading && !fetchError && total > 0;

  return (
    <View style={styles.screen}>
      <AuroraBackground />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.lg }]}
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
                  ? <>You've kept <Text style={styles.welcomeStrong}>{total}</Text> {total === 1 ? 'reel' : 'reels'}{categories > 1 ? <> across <Text style={styles.welcomeStrong}>{categories}</Text> topics</> : null}.</>
                  : 'Your second brain for short-form content.'}
            </Text>
          </View>
          <Pressable style={styles.menuBtn} onPress={() => setMenuOpen(true)} scaleTo={0.9}>
            <Icon name="menu" size={20} color={colors.textPrimary} />
          </Pressable>
        </MotiView>

        {/* ── Primary action — the ONE loud thing on this screen ── */}
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 350, delay: 100 }}
        >
          <Pressable style={styles.saveWrap} onPress={() => router.push('/save')} scaleTo={0.97}>
            <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.saveBtn}>
              <View style={styles.savePlus}><Plus size={20} color="#FFF" /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.saveTitle}>Save a reel</Text>
                <Text style={styles.saveSub}>Paste a link — the AI summary writes itself.</Text>
              </View>
              <ArrowRight size={20} color="rgba(255,255,255,0.9)" />
            </LinearGradient>
          </Pressable>
        </MotiView>

        {/* ── Library door ─────────────────────────────── */}
        <MotiView from={{ opacity: 0, translateY: 10 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 300, delay: 180 }}>
          <Pressable style={styles.quietRow} onPress={onEnter} scaleTo={0.98}>
            <View style={[styles.quietIcon, { backgroundColor: colors.accent + '1A' }]}>
              <Icon name="bookmark" size={18} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.quietTitle}>Open my library</Text>
              <Text style={styles.quietSub}>
                {hasSaves ? `All ${total} ${total === 1 ? 'save' : 'saves'}, searchable and organized.` : 'Everything you save lives here.'}
              </Text>
            </View>
            <Icon name="chevron-right" size={16} color={colors.textTertiary} />
          </Pressable>
        </MotiView>

        {/* ── Ask — quiet, secondary ───────────────────── */}
        {askVisible && (
          <MotiView from={{ opacity: 0, translateY: 10 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 300, delay: 250 }}>
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

        {/* ── What you can do ──────────────────────────── */}
        <View style={styles.features}>
          <Text style={styles.sectionLabel}>WHAT YOU CAN DO</Text>
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
        </View>

        <View style={{ flex: 1, minHeight: spacing.lg }} />

        <Text style={styles.disclaimer}>
          Summaries are generated by AI and may be wrong or have gaps — edit them and add your own notes anytime.
          Saved content belongs to its original creators; SaveHere keeps links and summaries for personal reference only.
        </Text>
      </ScrollView>

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
        showAsk={!askVisible}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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

  saveWrap: { borderRadius: radius.lg, ...shadow.glow },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    borderRadius: radius.lg, padding: spacing.md, paddingVertical: spacing.md + 2,
  },
  savePlus: {
    width: 40, height: 40, borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  saveTitle: { color: '#FFF', fontFamily: typeface.display, fontSize: font.lg, fontWeight: '800' },
  saveSub: { color: 'rgba(255,255,255,0.85)', fontSize: font.xs, marginTop: 1 },

  sectionLabel: { color: colors.textTertiary, fontSize: font.xs, fontWeight: '800', letterSpacing: 1.2 },

  quietRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2,
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md,
  },
  quietIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  quietTitle: { color: colors.textPrimary, fontSize: font.md, fontWeight: '700' },
  quietSub: { color: colors.textSecondary, fontSize: font.xs, marginTop: 1 },

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
});
