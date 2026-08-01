import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, Dimensions, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pressable } from './Pressable';
import { Label, Body, Rule, Rail, FilledButton } from './kit';
import { colors, spacing, font, tracking, typeface, motion, themed } from '../constants/theme';
import { useAuth } from '../contexts/AuthContext';

const ONBOARDING_KEY = '@savehere:onboarding:v1';
const { width: SCREEN_W } = Dimensions.get('window');

/**
 * First-run tour, full-bleed on the canvas.
 *
 * Structure follows the brief's reference: title, a short paragraph, one square
 * hero, a progress indicator, and a persistent CTA pinned at the bottom. What
 * differs is everything about the execution — the hero is a monochrome
 * geometric figure rather than a photograph, the progress is a numbered rail
 * rather than dots (whose active dot is that app's only spot of colour, which
 * this system cannot have), and the CTA is square rather than a white pill.
 */

type Figure = 'grid' | 'ask' | 'plan' | 'steps' | 'check' | 'save';

interface Step {
  eyebrow: string;
  title: string;
  description: string;
  figure: Figure;
}

const STEPS: Step[] = [
  {
    eyebrow: 'Welcome',
    title: 'A contact sheet\nfor everything you save.',
    description:
      'You start with a 10-day full trial — unlimited saves and 30 AI actions a day, no card needed. After that you keep your whole library, with 3 AI actions a day and up to 20 saves. Pro removes the limits.',
    figure: 'grid',
  },
  {
    eyebrow: 'Ask',
    title: 'Ask your own library.',
    description:
      'Ask in plain words — "what was that high-protein recipe?" — and get an answer built only from what you saved, with the sources it used. No generic web results.',
    figure: 'ask',
  },
  {
    eyebrow: 'Workouts',
    title: 'Turn a gym reel\ninto a real plan.',
    description:
      'Save any fitness video and tap Build Workout. Exercises, sets, reps and rest times become a hands-free session with countdown timers.',
    figure: 'plan',
  },
  {
    eyebrow: 'Recipes',
    title: 'Cook along,\nstep by step.',
    description:
      'Save a cooking video and tap Get Recipe. Ingredients and numbered steps you can tick off as you go. Edit anything, any time.',
    figure: 'steps',
  },
  {
    eyebrow: 'Study',
    title: 'Do the thing,\nnot just watch it.',
    description:
      'Save a tutorial or lesson and turn it into an actionable checklist — so what the video teaches actually gets done.',
    figure: 'check',
  },
  {
    eyebrow: 'Ready',
    title: 'Save your first link.',
    description:
      'Tap + to save from YouTube, Instagram, TikTok or LinkedIn. The summary and tags appear on their own.',
    figure: 'save',
  },
];

/**
 * The hero slot.
 *
 * The reference is image-led and this app ships no photography, so rather than
 * fake a picture the slot holds an abstract monochrome figure built from the
 * system's own primitives — frames, rules and hairlines. mono's imagery rule
 * sanctions exactly this: "illustrations are abstract, using a monochromatic
 * palette to match the UI, with strong geometric shapes, dots and lines."
 *
 * Fixed 1:1 so the slot never reflows between steps.
 */
function StepFigure({ kind }: { kind: Figure }) {
  return (
    <View style={styles.figure}>
      {kind === 'grid' && (
        <View style={styles.fGrid}>
          {Array.from({ length: 9 }).map((_, i) => (
            <View key={i} style={[styles.fCell, (i === 1 || i === 5 || i === 6) && styles.fCellOn]} />
          ))}
        </View>
      )}

      {kind === 'ask' && (
        <View style={styles.fStack}>
          <View style={styles.fBarWide} />
          <View style={styles.fBarMid} />
          <View style={styles.fGap} />
          <View style={[styles.fBarWide, styles.fOn]} />
          <View style={[styles.fBarMid, styles.fOn]} />
          <View style={[styles.fBarShort, styles.fOn]} />
        </View>
      )}

      {kind === 'plan' && (
        <View style={styles.fStack}>
          {[3, 4, 5, 4].map((n, r) => (
            <View key={r} style={styles.fRow}>
              {Array.from({ length: 5 }).map((_, c) => (
                <View key={c} style={[styles.fDot, c < n && styles.fOn]} />
              ))}
            </View>
          ))}
        </View>
      )}

      {kind === 'steps' && (
        <View style={styles.fStack}>
          {[0, 1, 2, 3].map(i => (
            <View key={i} style={styles.fStepRow}>
              <Text style={styles.fNum}>{String(i + 1).padStart(2, '0')}</Text>
              <View style={[styles.fBarWide, i === 0 && styles.fOn]} />
            </View>
          ))}
        </View>
      )}

      {kind === 'check' && (
        <View style={styles.fStack}>
          {[true, true, false, false].map((done, i) => (
            <View key={i} style={styles.fStepRow}>
              <View style={[styles.fBox, done && styles.fBoxOn]} />
              <View style={[styles.fBarWide, done && styles.fOn]} />
            </View>
          ))}
        </View>
      )}

      {kind === 'save' && (
        <View style={styles.fPlusWrap}>
          <View style={styles.fPlusV} />
          <View style={styles.fPlusH} />
        </View>
      )}
    </View>
  );
}

export function OnboardingModal() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [checked, setChecked] = useState(false);
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const slideX = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  // Shown only to a NEWLY CREATED account, once. The local storage key alone
  // isn't enough: storage is per-device/per-origin, so an existing user signing
  // in on a new device (or a new dev-server port) used to get the tour replayed
  // on every login. The "new user" signal is the Supabase account age — only an
  // account created minutes ago sees the tour; anyone older gets the key
  // stamped silently so it can never resurface.
  const userId = session?.user?.id;
  const createdAt = session?.user?.created_at;
  const storageKey = userId ? `${ONBOARDING_KEY}:${userId}` : null;
  const isFreshAccount =
    !!createdAt && Date.now() - new Date(createdAt).getTime() < 15 * 60 * 1000;

  useEffect(() => {
    if (!storageKey) { setChecked(false); setVisible(false); return; }
    AsyncStorage.getItem(storageKey).then((val) => {
      if (!val && isFreshAccount) {
        setVisible(true);
        setStep(0);
        Animated.timing(fadeIn, { toValue: 1, duration: motion.micro, useNativeDriver: true }).start();
      } else if (!val) {
        AsyncStorage.setItem(storageKey, 'completed');
      }
      setChecked(true);
    });
  }, [storageKey]);

  const goNext = () => {
    if (step < STEPS.length - 1) {
      Animated.timing(slideX, {
        toValue: -SCREEN_W, duration: motion.micro, useNativeDriver: true,
      }).start(() => {
        setStep((s) => s + 1);
        slideX.setValue(SCREEN_W);
        Animated.timing(slideX, {
          toValue: 0, duration: motion.micro, useNativeDriver: true,
        }).start();
      });
    } else {
      finish();
    }
  };

  const finish = () => {
    Animated.timing(fadeIn, { toValue: 0, duration: motion.micro, useNativeDriver: true }).start(() => {
      if (storageKey) AsyncStorage.setItem(storageKey, 'completed');
      setVisible(false);
    });
  };

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  if (!checked) return null;

  return (
    <Modal visible={visible} transparent={false} animationType="fade" statusBarTranslucent>
      <Animated.View style={[styles.screen, { opacity: fadeIn }]}>
        {/* Top: which step, out of how many. No Skip — first-run onboarding is
            shown once to a brand-new account and must be seen in full; the only
            way out is stepping through to the end (decided 2026-07-20). */}
        <View style={[styles.top, { paddingTop: insets.top + spacing.md }]}>
          <Label wide>{current.eyebrow}</Label>
          <Rail step={step + 1} total={STEPS.length} />
        </View>
        <Rule />

        <Animated.View style={[styles.page, { transform: [{ translateX: slideX }] }]}>
          <Text style={styles.title}>{current.title}</Text>
          <Body style={styles.desc}>{current.description}</Body>
          <StepFigure kind={current.figure} />
        </Animated.View>

        <View style={[styles.foot, { paddingBottom: insets.bottom + spacing.lg }]}>
          <FilledButton
            label={isLast ? 'Start saving' : 'Next'}
            trailing="→"
            onPress={goNext}
          />
          {step === 0 && (
            <Label style={styles.terms}>
              By continuing you agree to our Terms and Privacy Policy
            </Label>
          )}
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },

  page: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  title: {
    color: colors.textPrimary,
    fontFamily: typeface.display,
    fontSize: font.xxl,
    lineHeight: font.xxl * 1.12,
    letterSpacing: tracking.title,
  },
  desc: { marginTop: spacing.md, fontSize: font.sm, lineHeight: 21, maxWidth: 460 },

  // ── Figure slot ──
  figure: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  fGrid: {
    width: 168, height: 168,
    flexDirection: 'row', flexWrap: 'wrap',
  },
  fCell: {
    width: '33.333%', height: '33.333%',
    borderWidth: 0.5, borderColor: colors.ghostLine,
  },
  fCellOn: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },

  fStack: { width: 200, gap: spacing.sm },
  fRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  fStepRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  fBarWide: { flex: 1, height: 6, backgroundColor: colors.ghostLine },
  fBarMid: { width: '66%', height: 6, backgroundColor: colors.ghostLine },
  fBarShort: { width: '38%', height: 6, backgroundColor: colors.ghostLine },
  fGap: { height: spacing.md },
  fDot: { width: 14, height: 14, borderWidth: 1, borderColor: colors.ghostLine },
  fBox: { width: 14, height: 14, borderWidth: 1, borderColor: colors.ghostLine },
  fBoxOn: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  fOn: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
  fNum: {
    color: colors.textTertiary,
    fontFamily: typeface.label,
    fontSize: font.xs,
    letterSpacing: tracking.label,
    fontVariant: ['tabular-nums'],
    width: 20,
  },
  fPlusWrap: { width: 120, height: 120, alignItems: 'center', justifyContent: 'center' },
  fPlusV: { position: 'absolute', width: 1, height: 120, backgroundColor: colors.textPrimary },
  fPlusH: { position: 'absolute', height: 1, width: 120, backgroundColor: colors.textPrimary },

  foot: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.md },
  terms: { textAlign: 'center' },
}));
