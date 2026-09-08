import { useEffect, useState } from 'react';
import { View, Text, Modal, StyleSheet, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Icon } from './Icon';
import { Label, Body, Title, Rule, FilledButton, Index } from './kit';
import { useAuth } from '../contexts/AuthContext';
import { getCachedUsage, onUsage } from '../services/usageCache';
import { colors, spacing, font, tracking, typeface, motion, themed } from '../constants/theme';

const KEY = '@savehere:welcomeback:v1';

/**
 * Shown ONCE to someone who deleted their account and came back.
 *
 * ⚠️ IT IS NOT THE ONBOARDING TOUR, and that distinction is the whole point
 * (owner, 2026-08-15). A returning user knows what Findable is — walking them
 * through "save a link, get a summary" again is patronising and it is the thing
 * that makes a re-signup feel like starting from zero. So this is one screen,
 * not four: it acknowledges that they were here before, says plainly what did
 * and did not survive, and gets out of the way.
 *
 * ⚠️ IT ALSO SUPPRESSES THE TOUR. Their Supabase account really is minutes old,
 * so `OnboardingModal`'s "fresh account" gate is true for them too and both
 * would otherwise fire. OnboardingModal now defers to this one.
 *
 * The honesty rule this screen exists under: deletion really did wipe their
 * library, and pretending otherwise ("welcome back, everything's where you left
 * it!") would be a lie discovered ten seconds later on an empty grid. It says so
 * up front, and pairs it with the one genuinely good piece of news — the trial
 * clock they already used is not restarting, because `trial_grants` outlives the
 * account (see backend/app/entitlements.py).
 */
export function WelcomeBack() {
  const { session } = useAuth();
  const [visible, setVisible] = useState(false);
  const fade = useState(() => new Animated.Value(0))[0];
  const insets = useSafeAreaInsets();

  const userId = session?.user?.id;
  const storageKey = userId ? `${KEY}:${userId}` : null;
  // Seeded from the cache and kept in step with it: `returning` arrives with the
  // login-time /usage fetch, which may land after this mounts.
  const [isReturning, setIsReturning] = useState(() => getCachedUsage()?.returning === true);
  useEffect(() => onUsage(u => setIsReturning(u.returning === true)), []);

  useEffect(() => {
    if (!storageKey || !isReturning) return;
    let alive = true;
    AsyncStorage.getItem(storageKey).then(seen => {
      if (!alive || seen) return;
      setVisible(true);
      Animated.timing(fade, { toValue: 1, duration: motion.micro, useNativeDriver: true }).start();
    });
    return () => { alive = false; };
  }, [storageKey, isReturning]);

  const dismiss = () => {
    Animated.timing(fade, { toValue: 0, duration: motion.micro, useNativeDriver: true }).start(() => {
      if (storageKey) AsyncStorage.setItem(storageKey, 'seen');
      setVisible(false);
    });
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={dismiss}>
      <Animated.View style={[styles.screen, { opacity: fade, paddingTop: insets.top + spacing.xl }]}>
        <View style={styles.body}>
          <Label wide>Welcome back</Label>
          <Title style={styles.title}>Good to see you again.</Title>
          <Body style={styles.sub}>
            You've used Findable before, so we'll skip the tour. Three things worth knowing before
            you start again.
          </Body>

          <View style={styles.list}>
            <Rule />
            {[
              {
                head: 'Your old library is gone',
                detail:
                  'Deleting the account removed every save, summary, note and plan for good. Nothing was kept, and nothing can be brought back — this starts empty.',
              },
              {
                head: 'Your trial did not restart',
                detail:
                  'The trial clock is tied to your email, not to the account, so it carries on from where it was. If it had already run out, you are on the free plan.',
              },
              {
                head: 'Sharing is the fast way in',
                detail:
                  'Share a reel to Findable straight from Instagram, YouTube or Facebook and it saves in the background — you never have to open the app to keep something.',
              },
            ].map((row, i) => (
              <View key={row.head}>
                <View style={styles.row}>
                  <Index n={i + 1} style={styles.index} />
                  <View style={styles.rowText}>
                    <Text style={styles.rowHead}>{row.head}</Text>
                    <Body style={styles.rowDetail}>{row.detail}</Body>
                  </View>
                </View>
                <Rule />
              </View>
            ))}
          </View>
        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
          <FilledButton label="Start saving" trailing="→" onPress={dismiss} />
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  body: { flex: 1 },
  title: { marginTop: spacing.sm },
  sub: { marginTop: spacing.md, fontSize: font.sm, lineHeight: 20, maxWidth: 460 },

  list: { marginTop: spacing.xl },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start', paddingVertical: spacing.lg },
  index: { width: 22, paddingTop: 3 },
  rowText: { flex: 1, minWidth: 0, gap: spacing.sm },
  rowHead: {
    color: colors.textPrimary,
    fontFamily: typeface.display,
    fontSize: font.md,
    letterSpacing: tracking.heading,
  },
  rowDetail: { fontSize: font.sm, lineHeight: 20 },

  footer: { paddingTop: spacing.md },
}));
