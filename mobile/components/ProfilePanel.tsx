import { View, Text, StyleSheet, Modal, useWindowDimensions } from 'react-native';
import { MotiView } from 'moti';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Reel } from '../services/api';
import { Pressable } from './Pressable';
import { Icon } from './Icon';
import { useAuth } from '../contexts/AuthContext';
import { colors, spacing, font, radius, gradients, shadow } from '../constants/theme';

const APP_VERSION = '1.0.0';

interface Props {
  visible: boolean;
  onClose: () => void;
  reels: Reel[];
  // Hide the "Ask your library" row when the host screen already surfaces it
  // (the Landing shows it as a card) so the entry point isn't duplicated.
  showAsk?: boolean;
  // Full library count (reels may be a paginated subset on the library screen).
  total?: number;
}

export function ProfilePanel({ visible, onClose, reels, showAsk = true, total: totalProp }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const panelWidth = Math.min(330, width * 0.86);
  const { email, displayName, signOut } = useAuth();

  const go = (path: string) => { onClose(); router.push(path as any); };

  const total = totalProp ?? reels.length;
  const categories = new Set(reels.map(r => r.category).filter(Boolean)).size;
  const platforms = new Set(reels.map(r => r.platform).filter(Boolean)).size;

  const Stat = ({ icon, value, label }: { icon: string; value: number; label: string }) => (
    <View style={styles.stat}>
      <Icon name={icon} size={16} color={colors.accent} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );

  const Row = ({ icon, label }: { icon: string; label: string }) => (
    <View style={styles.row}>
      <Icon name={icon} size={18} color={colors.textSecondary} />
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.soon}><Text style={styles.soonText}>Soon</Text></View>
    </View>
  );

  const NavRow = ({ icon, label, path }: { icon: string; label: string; path: string }) => (
    <Pressable style={styles.row} onPress={() => go(path)} scaleTo={0.98}>
      <Icon name={icon} size={18} color={colors.accentLight} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Icon name="chevron-right" size={16} color={colors.textTertiary} />
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        {/* dim backdrop — tap to close */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} scaleTo={1} />

        <MotiView
          from={{ translateX: panelWidth }}
          animate={{ translateX: 0 }}
          transition={{ type: 'timing', duration: 260 }}
          style={[styles.panelWrap, { width: panelWidth }]}
        >
          {/* claim touches so taps inside don't close the panel */}
          <Pressable
            scaleTo={1}
            onPress={() => {}}
            style={[styles.panel, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.md }]}
          >
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Profile</Text>
              <Pressable onPress={onClose} hitSlop={10}><Icon name="close" size={20} color={colors.textSecondary} /></Pressable>
            </View>

            {/* Account block */}
            <View style={styles.account}>
              <LinearGradient colors={gradients.vibrant} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatar}>
                <Icon name="user" size={26} color="#FFF" />
              </LinearGradient>
              <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
              <Text style={styles.sub} numberOfLines={1}>{email ?? 'Synced to your account'}</Text>
            </View>

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

            {/* Library stats */}
            <Text style={styles.sectionLabel}>YOUR LIBRARY</Text>
            <View style={styles.stats}>
              <Stat icon="bookmark" value={total} label="Saved" />
              <Stat icon="layers" value={categories} label="Categories" />
              <Stat icon="all" value={platforms} label="Platforms" />
            </View>

            {/* Explore (working) */}
            <Text style={styles.sectionLabel}>EXPLORE</Text>
            <View style={styles.menu}>
              {showAsk && <NavRow icon="ask" label="Ask your library" path="/ask" />}
              <NavRow icon="rediscover" label="Rediscover saves" path="/rediscover" />
              <NavRow icon="sparkles" label="What you can do" path="/help" />
            </View>

            {/* Settings */}
            <Text style={styles.sectionLabel}>SETTINGS</Text>
            <View style={styles.menu}>
              <NavRow icon="create" label="Edit profile" path="/profile" />
              <Row icon="settings" label="Appearance" />
              <Row icon="bell" label="Notifications" />
              <Row icon="download" label="Export data" />
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
    backgroundColor: colors.surface,
    borderLeftWidth: 1, borderLeftColor: colors.border,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: colors.textPrimary, fontSize: font.lg, fontWeight: '800' },

  account: { alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  avatar: {
    width: 64, height: 64, borderRadius: radius.full,
    alignItems: 'center', justifyContent: 'center', ...shadow.glow,
  },
  name: { color: colors.textPrimary, fontSize: font.lg, fontWeight: '800' },
  sub: { color: colors.textSecondary, fontSize: font.xs },

  signInWrap: { gap: spacing.xs },
  signIn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md,
  },
  signInText: { flex: 1, color: colors.textPrimary, fontSize: font.md, fontWeight: '700' },
  signInHint: { color: colors.textTertiary, fontSize: font.xs, lineHeight: 16 },

  sectionLabel: { color: colors.textSecondary, fontSize: font.xs, fontWeight: '800', letterSpacing: 1 },

  stats: { flexDirection: 'row', gap: spacing.sm },
  stat: {
    flex: 1, alignItems: 'center', gap: 3,
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.md,
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
