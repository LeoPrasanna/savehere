import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, useWindowDimensions, Alert, Platform, ScrollView } from 'react-native';
import { MotiView } from 'moti';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { api, Reel, Usage, UsageLog } from '../services/api';
import { Pressable } from './Pressable';
import { Icon } from './Icon';
import { GlassCard } from './GlassCard';
import { BorderBeam } from './BorderBeam';
import { useAuth, avatarIcon } from '../contexts/AuthContext';
import { markReopenPanel } from '../services/sessionFlags';
import { colors, spacing, font, radius, gradients, shadow, themed, accentThemes, getAccentKey, setAccentTheme } from '../constants/theme';

const APP_VERSION = '1.0.0';

/** How many of today's AI actions the drill-down shows. The endpoint returns up
 *  to 200, but a short, honest list reads better than a wall — and the footer
 *  below says exactly how many more there are. */
const LOG_LIMIT = 10;

/** "3 days" / "1 day" / "a few hours" from an ISO end date. */
function trialDaysLeft(endsAt: string): string {
  const ms = new Date(endsAt).getTime() - Date.now();
  const days = Math.floor(ms / 86400000);
  if (days >= 2) return `${days} days`;
  if (days === 1) return '1 day';
  return 'a few hours';
}

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
  const { email, displayName, profile, signOut, deleteAccount } = useAuth();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);
  // Tap-to-expand drill-down: what today's AI actions were spent on. Lazy —
  // only fetched the first time the user opens it, kept until the panel closes.
  const [logOpen, setLogOpen] = useState(false);
  const [log, setLog] = useState<UsageLog | null>(null);
  const [logLoading, setLogLoading] = useState(false);
  // Measured size of the AI-budget card, so the BorderBeam can trace its outline.
  const [usageCardSize, setUsageCardSize] = useState({ w: 0, h: 0 });

  // Refresh the AI budget each time the panel opens; quietly keep the last known
  // value if the request fails (the meter is informative, never blocking).
  useEffect(() => {
    if (visible) api.getUsage().then(setUsage).catch(() => {});
    else { setLogOpen(false); setLog(null); }   // reset the drill-down on close
  }, [visible]);

  const toggleLog = () => {
    const next = !logOpen;
    setLogOpen(next);
    if (next && !log && !logLoading) {
      setLogLoading(true);
      api.getUsageLog().then(setLog).catch(() => {}).finally(() => setLogLoading(false));
    }
  };

  const go = (path: string) => { onClose(); router.push(path as any); };

  const total = totalProp ?? reels.length;
  const categories = new Set(reels.map(r => r.category).filter(Boolean)).size;
  const platforms = new Set(reels.map(r => r.platform).filter(Boolean)).size;

  const handleDeleteAccount = async () => {
    if (deleting) return;
    setDeleting(true);
    const result = await deleteAccount();
    setDeleting(false);
    setShowDeleteConfirm(false);
    onClose();
    if (result.error) {
      // Alert.alert is a silent no-op on react-native-web — errors must be
      // visible on every platform or deletion failures look like nothing.
      if (Platform.OS === 'web') window.alert(result.error);
      else Alert.alert('Account deletion failed', result.error);
    }
  };

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

  // Live switch: setAccentTheme mutates the tokens, regenerates themed()
  // sheets and remounts the tree (see constants/theme.ts) — instant, no page
  // reload. The session flag reopens this panel after the remount so the user
  // can keep trying colors.
  const chooseAccent = (key: string) => {
    if (key === getAccentKey()) return;
    markReopenPanel();
    setAccentTheme(key);
  };

  const AppearanceRow = ({ delay = 0 }: { delay?: number }) => (
    <MotiView
      from={{ opacity: 0, translateX: 20 }}
      animate={{ opacity: 1, translateX: 0 }}
      transition={{ type: 'timing', delay, duration: 300 }}
    >
      <View style={[styles.row, styles.appearanceRow]}>
        <View style={styles.appearanceHeader}>
          <Icon name="settings" size={18} color={colors.textSecondary} />
          <Text style={styles.rowLabel}>Appearance</Text>
        </View>
        <View style={styles.swatchRow}>
          {accentThemes.map(t => {
            const active = t.key === getAccentKey();
            return (
              <Pressable
                key={t.key}
                onPress={() => chooseAccent(t.key)}
                hitSlop={6}
                scaleTo={0.85}
                style={[styles.swatch, { backgroundColor: t.accent }, active && styles.swatchActive]}
              >
                {active && <Icon name="checkmark" size={12} color="#FFF" />}
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.swatchHint}>
          {accentThemes.find(t => t.key === getAccentKey())?.label ?? 'Ember'}
          {getAccentKey() === 'ember' ? ' (default)' : ''}
        </Text>
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
      <ScrollView
        style={styles.panel}
        contentContainerStyle={{
          gap: spacing.md,
          paddingHorizontal: spacing.lg,
          paddingTop: insets.top + spacing.md,
          paddingBottom: insets.bottom + spacing.md,
        }}
        showsVerticalScrollIndicator={false}
      >
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
              <Icon name={avatarIcon(profile.gender)} size={26} color="#FFF" />
            </LinearGradient>
            <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
            <Text style={styles.sub} numberOfLines={1}>{email ?? 'Synced to your account'}</Text>
            <View style={styles.tierBadge}>
              <Text style={styles.tierBadgeText}>
                {usage?.tier === 'pro' ? 'Pro' : usage?.tier === 'trial' ? 'Trial' : 'Free'}
              </Text>
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

        {/* Daily AI budget — honest meter so a quota 429 is never a surprise */}
        {usage && (
          <>
            <Text style={styles.sectionLabel}>AI TODAY</Text>
            <MotiView
              from={{ opacity: 0, translateY: 8 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: 300, delay: 450 }}
            >
              {/* Measured so the BorderBeam can trace this card's exact outline.
                  The travelling light is the affordance that says "tappable" —
                  same cue as the paste-URL field on the save screen. */}
              <View onLayout={(e) => {
                const { width, height } = e.nativeEvent.layout;
                setUsageCardSize((s) => (s.w === width && s.h === height ? s : { w: width, h: height }));
              }}>
              <GlassCard tint="violet" intensity="low" style={styles.usageCard}>
                {/* The whole header toggles the "what did I spend it on" list.
                    Only offer it when there's something to show. */}
                <Pressable
                  onPress={usage.used > 0 ? toggleLog : undefined}
                  disabled={usage.used === 0}
                  style={styles.usageHeader}
                  scaleTo={usage.used > 0 ? 0.99 : 1}
                >
                  <Icon name="sparkles" size={14} color={colors.accentLight} />
                  <Text style={styles.usageTitle}>
                    {usage.remaining} of {usage.limit} AI actions left
                  </Text>
                  {usage.used > 0 && (
                    <Icon name={logOpen ? 'chevron-right' : 'chevron-right'} size={14}
                          color={colors.textTertiary}
                          style={{ transform: [{ rotate: logOpen ? '90deg' : '0deg' }] }} />
                  )}
                </Pressable>
                <View style={styles.usageTrack}>
                  <LinearGradient
                    colors={gradients.hologram}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={[styles.usageFill, { width: `${Math.min(100, (usage.used / Math.max(1, usage.limit)) * 100)}%` }]}
                  />
                </View>

                {logOpen ? (
                  <View style={styles.logBox}>
                    {logLoading && !log ? (
                      <Text style={styles.usageHint}>Loading…</Text>
                    ) : log && log.items.length > 0 ? (
                      <>
                        {/* Say what this list is, so a short list never reads as
                            "that's everything" when it isn't. */}
                        <Text style={styles.logHeader}>
                          Last {Math.min(LOG_LIMIT, log.items.length)} AI action
                          {Math.min(LOG_LIMIT, log.items.length) > 1 ? 's' : ''} · newest first
                        </Text>
                        {log.items.slice(0, LOG_LIMIT).map((it, i) => (
                          <View key={i} style={styles.logRow}>
                            <Text style={styles.logAction}>{it.action_label}</Text>
                            {it.label ? <Text style={styles.logLabel} numberOfLines={1}>{it.label}</Text> : null}
                          </View>
                        ))}
                        {/* Covers BOTH kinds of hidden action: ones past the 10 we
                            show, and ones charged before the log existed (used > logged). */}
                        {(() => {
                          const shown = Math.min(LOG_LIMIT, log.items.length);
                          const hidden = log.used - shown;
                          return hidden > 0 ? (
                            <Text style={styles.logMore}>
                              + {hidden} more action{hidden > 1 ? 's' : ''} today
                            </Text>
                          ) : null;
                        })()}
                      </>
                    ) : (
                      <Text style={styles.usageHint}>No recorded actions yet today.</Text>
                    )}
                  </View>
                ) : (
                  <Text style={styles.usageHint}>
                    {usage.used > 0
                      ? 'Summaries, recipes, workouts & questions all count. Tap to see today\'s.'
                      : 'Summaries, recipes, workouts & questions all count. Resets daily.'}
                  </Text>
                )}
                {usage.tier === 'trial' && usage.trial_ends_at && (
                  <View style={styles.planRow}>
                    <Icon name="time" size={13} color={colors.warning} />
                    <Text style={styles.planText}>
                      Trial — {trialDaysLeft(usage.trial_ends_at)} left, then {' '}
                      <Text style={styles.planStrong}>3 AI actions/day · 20 saves</Text>
                    </Text>
                  </View>
                )}
                {usage.tier === 'free' && usage.saves.limit != null && (
                  <View style={styles.planRow}>
                    <Icon name="bookmark" size={13} color={colors.accentLight} />
                    <Text style={styles.planText}>
                      Saves used: <Text style={styles.planStrong}>{usage.saves.used} of {usage.saves.limit}</Text>
                      {'  ·  A Pro subscription unlocks more'}
                    </Text>
                  </View>
                )}
              </GlassCard>
              {/* Only while there's something to open — a beam on a dead card
                  would advertise an interaction that isn't there. */}
              {usage.used > 0 && usageCardSize.w > 0 && (
                <BorderBeam
                  width={usageCardSize.w}
                  height={usageCardSize.h}
                  radius={radius.lg}
                  color={colors.accentLight}
                  strokeWidth={1.5}
                />
              )}
              </View>
            </MotiView>
          </>
        )}

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
          <AppearanceRow delay={900} />
          <Row icon="bell" label="Notifications" delay={1000} />
        </View>

        {/* Danger zone */}
        <Text style={styles.sectionLabel}>DANGER ZONE</Text>
        <MotiView
          from={{ opacity: 0, translateX: 20 }}
          animate={{ opacity: 1, translateX: 0 }}
          transition={{ type: 'timing', delay: 1200, duration: 300 }}
        >
          <Pressable style={styles.dangerRow} onPress={() => setShowDeleteConfirm(true)} scaleTo={0.98}>
            <Icon name="trash" size={18} color={colors.danger} />
            <Text style={styles.dangerLabel}>Delete account</Text>
          </Pressable>
        </MotiView>

        <View style={{ flex: 1 }} />
        <View style={styles.footer}>
          <Text style={styles.footerApp}>SaveHere</Text>
          <Text style={styles.footerVer}>v{APP_VERSION}</Text>
        </View>
      </ScrollView>
    </MotiView>
      </View>

      {/* Delete Account Confirmation Modal */}
      <Modal visible={showDeleteConfirm} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.confirmOverlay}>
          <MotiView
            from={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', damping: 15 }}
          >
            <GlassCard tint="none" intensity="high" style={styles.confirmCard}>
              <View style={styles.confirmIconWrap}>
                <Icon name="trash" size={32} color={colors.danger} />
              </View>
              <Text style={styles.confirmTitle}>Delete your account?</Text>
              <Text style={styles.confirmDesc}>
                This will permanently remove all your saved reels, notes, workout plans, and personal data. This action cannot be undone.
              </Text>
              <View style={styles.confirmActions}>
                <Pressable style={styles.confirmCancel} onPress={() => setShowDeleteConfirm(false)} scaleTo={0.97}>
                  <Text style={styles.confirmCancelText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.confirmDelete} onPress={handleDeleteAccount} scaleTo={0.97}>
                  <LinearGradient colors={[colors.danger, '#FF4757']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.confirmDeleteInner}>
                    <Text style={styles.confirmDeleteText}>{deleting ? 'Deleting…' : 'Delete Account'}</Text>
                  </LinearGradient>
                </Pressable>
              </View>
            </GlassCard>
          </MotiView>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  panelWrap: { position: 'absolute', top: 0, bottom: 0, right: 0, ...shadow.md },
  panel: {
    flex: 1,
    backgroundColor: colors.surface,
    borderLeftWidth: 1, borderLeftColor: colors.border,
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

  usageCard: { padding: spacing.md, gap: spacing.xs },
  usageHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  usageTitle: { flex: 1, color: colors.textPrimary, fontSize: font.sm, fontWeight: '700' },
  usageTrack: {
    height: 6, borderRadius: radius.full, overflow: 'hidden',
    backgroundColor: colors.border, marginTop: 2,
  },
  usageFill: { height: '100%', borderRadius: radius.full },
  usageHint: { color: colors.textTertiary, fontSize: 10, marginTop: 2 },
  logBox: {
    marginTop: spacing.xs, paddingTop: spacing.xs,
    borderTopWidth: 1, borderTopColor: colors.border, gap: 5,
  },
  logHeader: {
    color: colors.textTertiary, fontSize: 10, fontWeight: '700',
    letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 2,
  },
  logRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  logAction: { color: colors.accentLight, fontSize: font.xs, fontWeight: '700', minWidth: 92 },
  logLabel: { flex: 1, color: colors.textSecondary, fontSize: font.xs },
  logMore: { color: colors.textTertiary, fontSize: 10, marginTop: 2, fontStyle: 'italic' },
  planRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: spacing.xs, paddingTop: spacing.xs,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  planText: { flex: 1, color: colors.textSecondary, fontSize: font.xs, lineHeight: 16 },
  planStrong: { color: colors.textPrimary, fontWeight: '700' },

  menu: { gap: spacing.sm },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md,
  },
  rowLabel: { flex: 1, color: colors.textPrimary, fontSize: font.md, fontWeight: '600' },
  soon: { backgroundColor: colors.accent + '22', borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  soonText: { color: colors.accentLight, fontSize: 10, fontWeight: '800' },

  appearanceRow: { flexDirection: 'column', alignItems: 'stretch', gap: spacing.sm },
  appearanceHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  swatchRow: { flexDirection: 'row', gap: spacing.sm + 2, paddingLeft: 26 },
  swatch: {
    width: 26, height: 26, borderRadius: radius.full,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'transparent',
  },
  swatchActive: { borderColor: '#FFF' },
  swatchHint: { color: colors.textTertiary, fontSize: font.xs, paddingLeft: 26 },

  dangerRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.danger + '12', borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.danger + '40', padding: spacing.md,
  },
  dangerLabel: { flex: 1, color: colors.danger, fontSize: font.md, fontWeight: '700' },

  footer: { alignItems: 'center', gap: 2 },
  footerApp: { color: colors.textSecondary, fontSize: font.sm, fontWeight: '800' },
  footerVer: { color: colors.textTertiary, fontSize: font.xs },

  // Confirmation modal
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 380,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  confirmIconWrap: {
    width: 64, height: 64, borderRadius: radius.full,
    backgroundColor: colors.danger + '18',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  confirmTitle: { color: colors.textPrimary, fontSize: font.lg, fontWeight: '900', textAlign: 'center' },
  confirmDesc: { color: colors.textSecondary, fontSize: font.sm, lineHeight: 20, textAlign: 'center' },
  confirmActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
    marginTop: spacing.md,
  },
  confirmCancel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  confirmCancelText: { color: colors.textPrimary, fontSize: font.md, fontWeight: '700' },
  confirmDelete: { flex: 1, borderRadius: radius.md, ...shadow.sm },
  confirmDeleteInner: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  confirmDeleteText: { color: '#FFF', fontSize: font.md, fontWeight: '800' },
}));
