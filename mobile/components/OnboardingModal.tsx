import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, Dimensions, Animated, Platform, useWindowDimensions,
} from 'react-native';
import { MotiView } from 'moti';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Sparkles, Brain, Dumbbell, ChefHat, BookOpen, Zap, ArrowRight, X,
} from 'lucide-react-native';
import { Pressable } from './Pressable';
import { GlassCard } from './GlassCard';
import { colors, spacing, font, radius, gradients, shadow } from '../constants/theme';
import { useAuth } from '../contexts/AuthContext';

const ONBOARDING_KEY = '@savehere:onboarding:v1';
const { width: SCREEN_W } = Dimensions.get('window');

interface OnboardingStep {
  title: string;
  subtitle: string;
  description: string;
  icon: React.ReactNode;
  gradient: readonly string[];
  accent: string;
}

const STEPS: OnboardingStep[] = [
  {
    title: 'Welcome to SaveHere',
    subtitle: 'Your AI-powered second brain',
    description:
      'You start with a 10-day full trial — unlimited saves and 30 AI actions a day, no credit card needed. After that you keep your whole library, with 3 AI actions a day and up to 20 saves. Pro removes the limits.',
    icon: <Sparkles size={40} color="#FFF" />,
    gradient: gradients.hologram,
    accent: colors.hologram,
  },
  {
    title: 'Ask Your Library',
    subtitle: 'Chat with everything you\'ve saved',
    description:
      'Ask natural questions like "What was that high-protein recipe?" or "Remind me of the shoulder workout." SaveHere answers using only your saved content — no generic web results.',
    icon: <Brain size={40} color="#FFF" />,
    gradient: gradients.cool,
    accent: '#5FC9BD',
  },
  {
    title: 'Build Workouts',
    subtitle: 'Turn fitness reels into guided plans',
    description:
      'Save any gym or fitness video, then tap "Build Workout." We extract exercises, sets, reps, and rest times into a hands-free session player with countdown timers.',
    icon: <Dumbbell size={40} color="#FFF" />,
    gradient: gradients.vibrant,
    accent: '#FF6B8A',
  },
  {
    title: 'Extract Recipes',
    subtitle: 'Cook-along steps from any food reel',
    description:
      'Save a cooking video and tap "Get Recipe." We pull out ingredients and numbered steps you can tick off as you cook. Edit anything anytime.',
    icon: <ChefHat size={40} color="#FFF" />,
    gradient: ['#FFB84D', '#FF8A5B'] as const,
    accent: '#FFB84D',
  },
  {
    title: 'Study Actions',
    subtitle: 'Checklists from tutorials & how-tos',
    description:
      'Save a tutorial or lesson and turn it into an actionable checklist. Actually do what the video teaches instead of just watching it.',
    icon: <BookOpen size={40} color="#FFF" />,
    gradient: gradients.primary,
    accent: colors.accent,
  },
  {
    title: 'You\'re All Set',
    subtitle: 'Start saving your first reel',
    description:
      'Tap the big + button to save a link from YouTube, Instagram, TikTok, or LinkedIn. The AI summary and tags appear automatically. Happy learning!',
    icon: <Zap size={40} color="#FFF" />,
    gradient: gradients.success,
    accent: colors.success,
  },
];

export function OnboardingModal() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [checked, setChecked] = useState(false);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { session } = useAuth();
  const cardWidth = Math.min(width - spacing.lg * 2, 400);
  const progress = useRef(new Animated.Value(0)).current;
  const slideX = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  // Keyed per user: each newly signed-in account sees the tour once, right
  // after their first sign-in (never over the login screen — no session, no
  // check). Behind the modal the app sits at the Landing screen, so closing
  // the tour lands them there.
  const userId = session?.user?.id;
  const storageKey = userId ? `${ONBOARDING_KEY}:${userId}` : null;

  useEffect(() => {
    if (!storageKey) { setChecked(false); setVisible(false); return; }
    AsyncStorage.getItem(storageKey).then((val) => {
      if (!val) {
        setVisible(true);
        setStep(0);
        Animated.timing(fadeIn, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      }
      setChecked(true);
    });
  }, [storageKey]);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: (step + 1) / STEPS.length,
      duration: 400,
      useNativeDriver: false,
    }).start();
  }, [step]);

  const goNext = () => {
    if (step < STEPS.length - 1) {
      Animated.timing(slideX, {
        toValue: -SCREEN_W,
        duration: 250,
        useNativeDriver: true,
      }).start(() => {
        setStep((s) => s + 1);
        slideX.setValue(SCREEN_W);
        Animated.timing(slideX, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }).start();
      });
    } else {
      finish();
    }
  };

  const finish = () => {
    Animated.timing(fadeIn, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      if (storageKey) AsyncStorage.setItem(storageKey, 'completed');
      setVisible(false);
    });
  };

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;
  const topSafe = insets.top + spacing.md;

  if (!checked) return null;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeIn }]}>
        {/* Dark solid overlay to dim the app behind */}
        <View style={styles.backdrop} pointerEvents="none">
          <LinearGradient
            colors={['rgba(11,10,15,0.92)', 'rgba(11,10,15,0.96)', 'rgba(11,10,15,0.92)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </View>

        <View style={[styles.overlay, { paddingTop: topSafe, paddingBottom: insets.bottom + spacing.lg }]}>
          {/* Top bar: Progress + Skip */}
          <View style={[styles.topBar, { paddingHorizontal: spacing.lg }]}>
            <View style={styles.progressWrap}>
              <View style={styles.progressTrack}>
                <Animated.View
                  style={[
                    styles.progressFill,
                    { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
                  ]}
                >
                  <LinearGradient
                    colors={gradients.hologram}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFill}
                  />
                </Animated.View>
              </View>
              <Text style={styles.progressText}>
                {step + 1} / {STEPS.length}
              </Text>
            </View>

            {!isLast && (
              <Pressable style={styles.skipBtn} onPress={finish} scaleTo={0.95}>
                <X size={18} color={colors.textSecondary} />
                <Text style={styles.skipText}>Skip</Text>
              </Pressable>
            )}
          </View>

          {/* Card */}
          <View style={styles.cardContainer}>
            <Animated.View style={{ transform: [{ translateX: slideX }], width: cardWidth }}>
              <GlassCard tint="none" intensity="high" style={styles.card}>
                {/* Animated accent glow behind icon */}
                <MotiView
                  from={{ opacity: 0.3, scale: 0.8 }}
                  animate={{ opacity: 0.6, scale: 1.2 }}
                  transition={{ type: 'timing', duration: 3000, loop: true, repeatReverse: true }}
                  style={[
                    styles.iconGlow,
                    { backgroundColor: current.accent },
                  ]}
                />

                {/* Icon circle */}
                <MotiView
                  from={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: 'spring', damping: 12, stiffness: 150 }}
                  style={styles.iconWrap}
                >
                  <LinearGradient
                    colors={current.gradient as [string, string]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={styles.iconGrad}
                  >
                    {current.icon}
                  </LinearGradient>
                  {/* Orbit ring */}
                  <MotiView
                    from={{ rotate: '0deg' }}
                    animate={{ rotate: '360deg' }}
                    transition={{ type: 'timing', duration: 8000, loop: true }}
                    style={[styles.orbitRing, { borderColor: current.accent + '40' }]}
                  />
                </MotiView>

                {/* Text */}
                <MotiView
                  from={{ opacity: 0, translateY: 12 }}
                  animate={{ opacity: 1, translateY: 0 }}
                  transition={{ type: 'timing', duration: 400, delay: 150 }}
                  style={styles.textBlock}
                >
                  <Text style={styles.title}>{current.title}</Text>
                  <Text style={styles.subtitle}>{current.subtitle}</Text>
                  <Text style={styles.description}>{current.description}</Text>
                </MotiView>

                {/* Dots */}
                <View style={styles.dotsRow}>
                  {STEPS.map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.dot,
                        i === step && { backgroundColor: current.accent, width: 24 },
                        i < step && { backgroundColor: colors.textSecondary },
                      ]}
                    />
                  ))}
                </View>

                {/* CTA */}
                <Pressable onPress={goNext} scaleTo={0.97} style={styles.ctaWrap}>
                  <LinearGradient
                    colors={(isLast ? gradients.success : current.gradient) as [string, string]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={styles.cta}
                  >
                    <Text style={styles.ctaText}>{isLast ? 'Get Started' : 'Next'}</Text>
                    <ArrowRight size={18} color="#FFF" />
                  </LinearGradient>
                </Pressable>

                {isFirst && (
                  <Text style={styles.terms}>
                    By continuing, you agree to our Terms and Privacy Policy.
                  </Text>
                )}
              </GlassCard>
            </Animated.View>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 1,
  },
  overlay: {
    flex: 1,
    zIndex: 2,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  progressWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressText: {
    color: colors.textSecondary,
    fontSize: font.xs,
    fontWeight: '700',
    minWidth: 36,
    textAlign: 'right',
  },
  skipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  skipText: {
    color: colors.textSecondary,
    fontSize: font.sm,
    fontWeight: '700',
  },
  cardContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
  },
  iconGlow: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    opacity: 0.3,
    top: 24,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 40 },
      default: { elevation: 0 },
    }),
  },
  iconWrap: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGrad: {
    width: 80,
    height: 80,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.glow,
  },
  orbitRing: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  textBlock: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  title: {
    color: colors.textPrimary,
    fontSize: font.xl,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: colors.accentLight,
    fontSize: font.sm,
    fontWeight: '700',
    textAlign: 'center',
  },
  description: {
    color: colors.textSecondary,
    fontSize: font.sm,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: spacing.xs,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  ctaWrap: {
    width: '100%',
    borderRadius: radius.md,
    ...shadow.glow,
    marginTop: spacing.xs,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    minHeight: 52,
  },
  ctaText: {
    color: '#FFF',
    fontSize: font.md,
    fontWeight: '900',
  },
  terms: {
    color: colors.textTertiary,
    fontSize: 10,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
