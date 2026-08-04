import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, Animated, ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '../../../components/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, WorkoutExercise, WorkoutPlan } from '../../../services/api';
import { Pressable } from '../../../components/Pressable';
import { FloatingHomeButton, goHome } from '../../../components/HomeButton';
import { Disclaimer } from '../../../components/Disclaimer';
import { colors, spacing, font, radius, gradients, shadow, themed } from '../../../constants/theme';

type Phase = 'loading' | 'ready' | 'exercise' | 'rest' | 'complete';

// Distinct glyph per muscle group — keep in sync with app/workout/[reelId].tsx.
const MUSCLE_ICON: Record<string, string> = {
  chest: 'fitness', legs: 'footsteps', back: 'body', core: 'flame',
  shoulders: 'muscle', arms: 'muscle', full_body: 'body', cardio: 'cardio',
};

const MOTIVATION: string[] = [
  'Keep pushing!', 'You\'ve got this!', 'Almost there!',
  'Strong work!', 'Breathe and reset.', 'Rest up, go again.',
];

export default function WorkoutSessionScreen() {
  const { reelId } = useLocalSearchParams<{ reelId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [phase, setPhase] = useState<Phase>('loading');
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [exerciseIdx, setExerciseIdx] = useState(0);
  const [setIdx, setSetIdx] = useState(0);
  const [restSeconds, setRestSeconds] = useState(0);
  const [totalSetsCompleted, setTotalSetsCompleted] = useState(0);
  const [startTime] = useState(Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const restProgress = useRef(new Animated.Value(1)).current;
  const restAnimation = useRef<Animated.CompositeAnimation | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api.getWorkout(reelId).then(p => {
      setPlan(p);
      setPhase('ready');
    }).catch(() => router.back());
  }, [reelId]);

  useEffect(() => {
    if (phase === 'exercise' || phase === 'rest') {
      elapsedRef.current = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    }
    return () => { if (elapsedRef.current) clearInterval(elapsedRef.current); };
  }, [phase]);

  const startRest = useCallback((seconds: number) => {
    setPhase('rest');
    setRestSeconds(seconds);
    restProgress.setValue(1);
    restAnimation.current = Animated.timing(restProgress, {
      toValue: 0,
      duration: seconds * 1000,
      useNativeDriver: false,
    });
    restAnimation.current.start();

    if (timerRef.current) clearInterval(timerRef.current);
    let remaining = seconds;
    timerRef.current = setInterval(() => {
      remaining -= 1;
      setRestSeconds(remaining);
      if (remaining <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        advanceAfterRest();
      }
    }, 1000);
  }, [exerciseIdx, setIdx, plan]);

  const stopRest = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (restAnimation.current) restAnimation.current.stop();
  };

  const advanceAfterRest = useCallback(() => {
    if (!plan) return;
    const ex = plan.exercises[exerciseIdx];
    const totalSets = ex.sets ?? 3;
    if (setIdx + 1 < totalSets) {
      setSetIdx(s => s + 1);
      setPhase('exercise');
    } else {
      const nextIdx = exerciseIdx + 1;
      if (nextIdx < plan.exercises.length) {
        setExerciseIdx(nextIdx);
        setSetIdx(0);
        setPhase('exercise');
      } else {
        setPhase('complete');
      }
    }
  }, [exerciseIdx, setIdx, plan]);

  const handleSetDone = () => {
    if (!plan) return;
    setTotalSetsCompleted(t => t + 1);
    const ex = plan.exercises[exerciseIdx];
    startRest(ex.rest_seconds ?? 60);
  };

  const handleSkipRest = () => { stopRest(); advanceAfterRest(); };

  const handleSkipExercise = () => {
    if (!plan) return;
    const nextIdx = exerciseIdx + 1;
    if (nextIdx < plan.exercises.length) {
      setExerciseIdx(nextIdx);
      setSetIdx(0);
      setPhase('exercise');
    } else {
      setPhase('complete');
    }
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const totalSetsAll = plan?.exercises.reduce((s, e) => s + (e.sets ?? 3), 0) ?? 1;
  const progressPct = (totalSetsCompleted / totalSetsAll) * 100;

  // ── Loading ──────────────────────────────────────────────
  if (phase === 'loading') {
    return <View style={styles.center}><ActivityIndicator color={colors.accent} size="large" /></View>;
  }

  // ── Ready ────────────────────────────────────────────────
  if (phase === 'ready' && plan) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
        <FloatingHomeButton top={insets.top + spacing.xs} />
        <View style={styles.readyHeader}>
          <LinearGradient colors={gradients.vibrant} style={styles.readyIcon}>
            <Icon name="barbell" size={30} color={colors.onAction} />
          </LinearGradient>
          <Text style={styles.readyTitle}>{plan.workout_name}</Text>
          <Text style={styles.readyMeta}>
            {plan.exercises.length} exercises · {totalSetsAll} sets · ~{plan.estimated_minutes} min
          </Text>
        </View>

        <ScrollView style={styles.readyList} contentContainerStyle={{ gap: spacing.sm }} showsVerticalScrollIndicator={false}>
          {plan.exercises.map((ex, i) => (
            <View key={ex.id} style={styles.readyItem}>
              <View style={styles.readyItemNum}><Text style={styles.readyItemNumText}>{i + 1}</Text></View>
              <Icon name={MUSCLE_ICON[ex.muscle_group] ?? 'fitness'} size={18} color={colors.accentLight} />
              <Text style={styles.readyItemName} numberOfLines={1}>{ex.name}</Text>
              <Text style={styles.readyItemDetail}>
                {ex.sets ?? 3} × {ex.duration_seconds != null ? `${ex.duration_seconds}s` : (ex.reps ?? 10)}
              </Text>
            </View>
          ))}
        </ScrollView>

        <View style={{ paddingBottom: insets.bottom + spacing.md, gap: spacing.sm }}>
          <Disclaimer variant="fitness" />
          <GradientButton icon="play" label="Begin Workout" gradient={gradients.primary} onPress={() => setPhase('exercise')} />
        </View>
      </View>
    );
  }

  // ── Complete ─────────────────────────────────────────────
  if (phase === 'complete') {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <FloatingHomeButton top={insets.top + spacing.xs} />
        <Icon name="celebrate" size={72} color={colors.accent} style={{ marginBottom: spacing.md }} />
        <Text style={styles.completeTitle}>Workout Complete!</Text>
        <Text style={styles.completeSub}>Crushed it. Here's your session.</Text>

        <View style={styles.statsGrid}>
          {[
            { value: formatTime(elapsedSeconds), label: 'TIME', icon: 'time' as const },
            { value: `${plan?.exercises.length ?? 0}`, label: 'EXERCISES', icon: 'fitness' as const },
            { value: `${totalSetsCompleted}`, label: 'SETS', icon: 'repeat' as const },
          ].map(s => (
            <View key={s.label} style={styles.statBox}>
              <Icon name={s.icon} size={18} color={colors.accent} />
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.completeBtnWrap}>
          <GradientButton icon="checkmark" label="Done" gradient={gradients.success} onPress={goHome} />
        </View>
      </View>
    );
  }

  const ex: WorkoutExercise = plan!.exercises[exerciseIdx];
  const totalSetsForEx = ex.sets ?? 3;
  const isHold = ex.duration_seconds != null;
  const nextEx = plan!.exercises[exerciseIdx + 1];

  // ── Rest ─────────────────────────────────────────────────
  if (phase === 'rest') {
    const motivation = MOTIVATION[Math.floor(Math.random() * MOTIVATION.length)];
    return (
      <LinearGradient colors={['#15131C', '#1A2740', '#15131C']} style={[styles.center, { paddingTop: insets.top }]}>
        <View style={styles.topProgress}>
          <View style={[styles.topProgressFillStatic, { width: `${progressPct}%` as any }]}>
            <LinearGradient colors={gradients.cool} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
          </View>
        </View>

        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.md, width: '100%' }}>
          <Text style={styles.restLabel}>REST</Text>
          <Text style={styles.motivation}>{motivation}</Text>

          <Text style={styles.restCount}>{restSeconds}</Text>
          <Text style={styles.restUnit}>SECONDS</Text>

          <View style={styles.restBarTrack}>
            <Animated.View style={[styles.restBarFillWrap, {
              width: restProgress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            }]}>
              <LinearGradient colors={gradients.cool} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1, borderRadius: radius.full }} />
            </Animated.View>
          </View>

          {nextEx && (
            <View style={styles.nextBox}>
              <Text style={styles.nextLabel}>NEXT UP</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Icon name={MUSCLE_ICON[nextEx.muscle_group] ?? 'fitness'} size={16} color={colors.textPrimary} />
                <Text style={styles.nextExercise}>{nextEx.name}</Text>
              </View>
              <Text style={styles.nextDetail}>
                {nextEx.sets ?? 3} sets × {nextEx.duration_seconds != null ? `${nextEx.duration_seconds}s` : (nextEx.reps ?? 10) + ' reps'}
              </Text>
            </View>
          )}
        </View>

        <View style={{ paddingBottom: insets.bottom + spacing.lg }}>
          <Pressable onPress={handleSkipRest} style={styles.skipBtn}>
            <Text style={styles.skipBtnText}>Skip Rest</Text>
            <Icon name="arrow-forward" size={16} color={colors.accentLight} />
          </Pressable>
        </View>
      </LinearGradient>
    );
  }

  // ── Exercise ─────────────────────────────────────────────
  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.topProgress}>
        <View style={[styles.topProgressFillStatic, { width: `${progressPct}%` as any }]}>
          <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
        </View>
      </View>
      <Text style={styles.topProgressLabel}>
        {totalSetsCompleted} / {totalSetsAll} sets · {formatTime(elapsedSeconds)}
      </Text>

      <View style={{ flex: 1, justifyContent: 'center', width: '100%', gap: spacing.lg }}>
        <Text style={styles.exerciseCounter}>EXERCISE {exerciseIdx + 1} OF {plan!.exercises.length}</Text>

        <View style={styles.exerciseCard}>
          <Icon name={MUSCLE_ICON[ex.muscle_group] ?? 'fitness'} size={52} color={colors.accent} />
          <Text style={styles.exerciseNameLarge}>{ex.name.toUpperCase()}</Text>

          <View style={styles.setDotsRow}>
            {Array.from({ length: totalSetsForEx }).map((_, i) => (
              <View key={i} style={[styles.setDot, i < setIdx && styles.setDotDone, i === setIdx && styles.setDotCurrent]} />
            ))}
          </View>
          <Text style={styles.setCounter}>Set {setIdx + 1} of {totalSetsForEx}</Text>

          <LinearGradient colors={gradients.primary} style={styles.targetCircle}>
            <Text style={styles.targetNumber}>{isHold ? ex.duration_seconds : (ex.reps ?? 10)}</Text>
            <Text style={styles.targetUnit}>{isHold ? 'SECONDS' : 'REPS'}</Text>
          </LinearGradient>
        </View>
      </View>

      <View style={{ width: '100%', paddingBottom: insets.bottom + spacing.md, gap: spacing.sm }}>
        <GradientButton icon="checkmark" label="Set Done" gradient={gradients.primary} onPress={handleSetDone} glow />
        <View style={styles.secondaryRow}>
          <Pressable onPress={handleSkipExercise}><Text style={styles.secondaryBtn}>Skip exercise</Text></Pressable>
          <Pressable onPress={() => setPhase('complete')}><Text style={[styles.secondaryBtn, { color: colors.danger }]}>End workout</Text></Pressable>
        </View>
      </View>
    </View>
  );
}

function GradientButton({ icon, label, gradient, onPress, glow }: {
  icon: any; label: string; gradient: readonly [string, string]; onPress: () => void; glow?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.bigBtnWrap, glow && shadow.glow]} scaleTo={0.97}>
      <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.bigBtn}>
        <Icon name={icon} size={20} color={colors.onAction} />
        <Text style={styles.bigBtnText}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },

  topProgress: { width: '100%', height: 6, backgroundColor: colors.border, borderRadius: radius.full, overflow: 'hidden', marginBottom: 6 },
  topProgressFillStatic: { height: '100%', borderRadius: radius.full, overflow: 'hidden' },
  topProgressLabel: { color: colors.textSecondary, fontSize: font.xs, textAlign: 'center', fontWeight: '600' },

  // Ready
  readyHeader: { alignItems: 'center', gap: spacing.xs, marginBottom: spacing.lg },
  readyIcon: { width: 72, height: 72, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm, ...shadow.glow },
  readyTitle: { color: colors.textPrimary, fontSize: font.xl, fontWeight: '800', textAlign: 'center', letterSpacing: -0.5 },
  readyMeta: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'center' },
  readyList: { width: '100%', flex: 1 },
  readyItem: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.sm + 2,
    borderWidth: 1, borderColor: colors.border,
  },
  readyItemNum: { width: 24, height: 24, borderRadius: radius.full, backgroundColor: colors.accent + '33', alignItems: 'center', justifyContent: 'center' },
  readyItemNumText: { color: colors.accentLight, fontSize: font.xs, fontWeight: '800' },
  readyItemEmoji: { fontSize: 18 },
  readyItemName: { flex: 1, color: colors.textPrimary, fontSize: font.sm, fontWeight: '600' },
  readyItemDetail: { color: colors.textSecondary, fontSize: font.xs, fontWeight: '600' },

  // Big button
  bigBtnWrap: { width: '100%', borderRadius: radius.md },
  bigBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    borderRadius: radius.md, padding: spacing.md, minHeight: 58,
  },
  bigBtnText: { color: colors.onAction, fontSize: font.lg, fontWeight: '800' },

  // Exercise
  exerciseCounter: { color: colors.textSecondary, fontSize: font.xs, fontWeight: '800', letterSpacing: 2, textAlign: 'center' },
  exerciseCard: {
    width: '100%', backgroundColor: colors.card, borderRadius: radius.xl, padding: spacing.xl,
    alignItems: 'center', borderWidth: 1, borderColor: colors.border, gap: spacing.sm, ...shadow.md,
  },
  exerciseMuscleEmoji: { fontSize: 52 },
  exerciseNameLarge: { color: colors.textPrimary, fontSize: 24, fontWeight: '800', letterSpacing: 1.5, textAlign: 'center' },
  setDotsRow: { flexDirection: 'row', gap: 8, marginTop: spacing.sm },
  setDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.border },
  setDotDone: { backgroundColor: colors.accent + '88' },
  setDotCurrent: { backgroundColor: colors.accent, transform: [{ scale: 1.35 }] },
  setCounter: { color: colors.textSecondary, fontSize: font.sm, fontWeight: '600' },
  targetCircle: {
    width: 150, height: 150, borderRadius: 75, alignItems: 'center', justifyContent: 'center',
    marginTop: spacing.md, ...shadow.glow,
  },
  targetNumber: { color: colors.onAction, fontSize: 60, fontWeight: '900', lineHeight: 66 },
  targetUnit: { color: 'rgba(255,255,255,0.85)', fontSize: font.xs, letterSpacing: 3, fontWeight: '800' },

  secondaryRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xl, marginTop: spacing.xs },
  secondaryBtn: { color: colors.textSecondary, fontSize: font.sm, fontWeight: '600' },

  // Rest
  restLabel: { color: colors.accentLight, fontSize: font.sm, letterSpacing: 6, fontWeight: '800' },
  motivation: { color: colors.textSecondary, fontSize: font.md, fontStyle: 'italic' },
  restCount: { color: colors.onAction, fontSize: 110, fontWeight: '900', lineHeight: 116 },
  restUnit: { color: colors.textSecondary, fontSize: font.sm, letterSpacing: 4, fontWeight: '700', marginTop: -spacing.sm },
  restBarTrack: { width: '80%', height: 8, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: radius.full, overflow: 'hidden', marginTop: spacing.md },
  restBarFillWrap: { height: '100%' },
  nextBox: {
    backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: radius.lg, padding: spacing.md,
    alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.borderLight, width: '100%', marginTop: spacing.lg,
  },
  nextLabel: { color: colors.textSecondary, fontSize: 10, letterSpacing: 2, fontWeight: '800' },
  nextExercise: { color: colors.textPrimary, fontSize: font.md, fontWeight: '700' },
  nextDetail: { color: colors.textSecondary, fontSize: font.xs },
  skipBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: spacing.sm },
  skipBtnText: { color: colors.accentLight, fontSize: font.md, fontWeight: '700' },

  // Complete
  completeEmoji: { fontSize: 80, marginBottom: spacing.md },
  completeTitle: { color: colors.textPrimary, fontSize: font.xxl, fontWeight: '900', letterSpacing: -0.5 },
  completeSub: { color: colors.textSecondary, fontSize: font.sm, marginBottom: spacing.xl, marginTop: spacing.xs },
  statsGrid: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xl, width: '100%' },
  statBox: {
    flex: 1, backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md,
    alignItems: 'center', borderWidth: 1, borderColor: colors.border, gap: 4,
  },
  statValue: { color: colors.textPrimary, fontSize: font.xl, fontWeight: '800' },
  statLabel: { color: colors.textSecondary, fontSize: 10, letterSpacing: 1, fontWeight: '700' },
  completeBtnWrap: { width: '100%' },
}));
