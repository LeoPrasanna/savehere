import { View, Text, StyleSheet, Modal, useWindowDimensions, Dimensions } from 'react-native';
import { MotiView } from 'moti';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Reel } from '../services/api';
import { Pressable } from './Pressable';
import { Icon } from './Icon';
import { GlassCard } from './GlassCard';
import { HolographicShimmer } from './HolographicShimmer';
import { useAuth } from '../contexts/AuthContext';
import { colors, spacing, font, radius, gradients, shadow } from '../constants/theme';

const APP_VERSION = '1.0.0';
const SCREEN_H = Dimensions.get('window').height;

interface Props {
  visible: boolean;
  onClose: () => void;
  reels: Reel[];
  showAsk?: boolean;
  total?: number;
}

export function ProfilePanel({ visible, onClose, reels, showAsk = true, total: totalProp }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const panelWidth = Math.min(330, width * 0.86);
  const { email, displayName, signOut } = useAuth();
  const shimmerW = panelWidth - spacing.lg * 2;

  const go = (path: string) => { onClose(); router.push(path as any); };

  const total = totalProp ?? reels.length;
  const categories = new Set(reels.map(r => r.category).filter(Boolean)).size;
  const platforms = new Set(reels.map(r => r.platform).filter(Boolean)).size;

  const Stat = ({ icon, value, label, delay = 0 }: { icon: string; value: number; label: string; delay?: number }) => (
    <MotiView
      from={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', delay, damping: 14 }}
      style={{ flex: 1 }}
    >
      <GlassCard tint="violet" intensity="low" style={styles.statCard}>
        <Icon name={icon} size={16} color={colors.accent} />
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </GlassCard>
    </MotiView>
  );

  const Row = ({ icon, label, delay = 0 }: { icon: string; label: string; delay?: number }) => (
    <MotiView
      from={{ opacity: 0, translateX: 20 }}
      animate={{ opacity: 1, translateX: 0 }}
      transition={{ type: 'timing', delay, duration: 300 }}
    >
      <View style={styles.row}>
        <Icon name={icon} size={18} color={colors.textSecondary} />
        <Text style={styles.rowLabel}>{label}</Text>
        <View style={styles.soon}><Text style={styles.soonText}>Soon</Text></View>
      </View>
    </MotiView>
  );

  const NavRow = ({ icon, label, path, delay = 0 }: { icon: string; label: string; path: string; delay?: number }) => (
    <MotiView
      from={{ opacity: 0, translateX: 20 }}
      animate={{ opacity: 1, translateX: 0 }}
      transition={{ type: 'timing', delay, duration: 300 }}
    >
      <Pressable style={styles.row} onPress={() => go(path)} scaleTo={0.98}>
        <Icon name={icon} size={18} color={colors.accentLight} />
        <Text style={styles.rowLabel}>{label}</Text>
        <Icon name="chevron-right" size={16} color={colors.textTertiary} />
      </Pressable>
    </MotiView>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} scaleTo={1} />

        <MotiView
          from={{ translateX: panelWidth }}
          animate={{ translateX: 0 }}
          transition={{ type: 'timing', duration: 260 }}
          style={[styles.panelWrap, { width: panelWidth }]}
        >
          <Pressable
            scaleTo={1}
            onPress={() => {}}
            style={[styles.panel, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.md }]}
          >
            <HolographicShimmer width={shimmerW} height={SCREEN_H} color="rgba(139,125,255,0.04)" duration={5000} delay={800} />

            <View style={styles.header}>
              <Text style={styles.headerTitle}>Profile</Text>
              <Pressable onPress={onClose} hitSlop={10}><Icon name="close" size={20} color={colors.textSecondary} /></Pressable>
            </View>

            {/* Account block with glassmorphism */}
            <MotiView
              from={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', damping: 14, delay: 100 }}
            >
              <GlassCard tint="violet" intensity="medium" style={styles.accountCard}>
                <LinearGradient colors={gradients.hologram} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatar}>
                  <Icon name="user" size={26} color="#FFF" />
                </LinearGradient>
                <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
                <Text style={styles.sub} numberOfLines={1}>{email ?? 'Synced to your account'}</Text>
                <View style={styles.tierBadge}>
                  <Text style={styles.tierBadgeText}>Free</Text>
                </View>
              </GlassCard>
            </MotiView>

            <Pressable
              style={styles.signInWrap}
              scaleTo={0.98}
              onPress={() => { onClose(); signOut(); }}
            >
              <View style={styles.signIn}>
                <Icon name="login" size={16} color={colors.danger} />
                <Text style={[styles.signInText, { color: colors.danger }]}>Sign out</Text>
              </View>
            </Pressable>

            {/* Library stats with animation */}
            <Text style={styles.sectionLabel}>YOUR LIBRARY</Text>
            <View style={styles.stats}>
              <Stat icon="bookmark" value={total} label="Saved" delay={200} />
              <Stat icon="layers" value={categories} label="Categories" delay={300} />
              <Stat icon="all" value={platforms} label="Platforms" delay={400} />
            </View>

            {/* Explore */}
            <Text style={styles.sectionLabel}>EXPLORE</Text>
            <View style={styles.menu}>
              {showAsk && <NavRow icon="ask" label="Ask your library" path="/ask" delay={500} />}
              <NavRow icon="rediscover" label="Rediscover saves" path="/rediscover" delay={600} />
              <NavRow icon="sparkles" label="What you can do" path="/help" delay={700} />
            </View>

            {/* Settings */}
            <Text style={styles.sectionLabel}>SETTINGS</Text>
            <View style={styles.menu}>
              <NavRow icon="create" label="Edit profile" path="/profile" delay={800} />
              <Row icon="settings" label="Appearance" delay={900} />
              <Row icon="bell" label="Notifications" delay={1000} />
              <Row icon="download" label="Export data" delay={1100} />
            </View>

            <View style={{ flex: 1 }} />
            <View style={styles.footer}>
              <Text style={styles.footerApp}>SaveHere</Text>
              <Text style={styles.footerVer}>v{APP_VERSION}</Text>
            </View>
          </Pressable>
        </MotiView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  panelWrap: { position: 'absolute', top: 0, bottom: 0, right: 0, ...shadow.md },
  panel: {
    flex: 1,
    backgroundColor: 'rgba(21,19,28,0.92)',
    borderLeftWidth: 1, borderLeftColor: colors.borderLight,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: colors.textPrimary, fontSize: font.lg, fontWeight: '800' },

  accountCard: {
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  avatar: {
    width: 64, height: 64, borderRadius: radius.full,
    alignItems: 'center', justifyContent: 'center', ...shadow.glow,
  },
  name: { color: colors.textPrimary, fontSize: font.lg, fontWeight: '800', marginTop: spacing.xs },
  sub: { color: colors.textSecondary, fontSize: font.xs },
  tierBadge: {
    backgroundColor: colors.accent + '22',
    borderRadius: radius.full,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: colors.accent + '40',
    marginTop: spacing.xs,
  },
  tierBadgeText: { color: colors.accentLight, fontSize: 10, fontWeight: '800' },

  signInWrap: { gap: spacing.xs },
  signIn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md,
  },
  signInText: { flex: 1, color: colors.textPrimary, fontSize: font.md, fontWeight: '700' },

  sectionLabel: { color: colors.textSecondary, fontSize: font.xs, fontWeight: '800', letterSpacing: 1 },

  stats: { flexDirection: 'row', gap: spacing.sm },
  statCard: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: spacing.md,
  },
  statValue: { color: colors.textPrimary, fontSize: font.xl, fontWeight: '800' },
  statLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: '600' },

  menu: { gap: spacing.sm },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md,
  },
  rowLabel: { flex: 1, color: colors.textPrimary, fontSize: font.md, fontWeight: '600' },
  soon: { backgroundColor: colors.accent + '22', borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  soonText: { color: colors.accentLight, fontSize: 10, fontWeight: '800' },

  footer: { alignItems: 'center', gap: 2 },
  footerApp: { color: colors.textSecondary, fontSize: font.sm, fontWeight: '800' },
  footerVer: { color: colors.textTertiary, fontSize: font.xs },
});
