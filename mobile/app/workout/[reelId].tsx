import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '../../components/Icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, WorkoutExercise, WorkoutPlan } from '../../services/api';
import { Pressable } from '../../components/Pressable';
import { AuroraBackground } from '../../components/AuroraBackground';
import { Disclaimer } from '../../components/Disclaimer';
import { colors, spacing, font, radius, gradients, shadow } from '../../constants/theme';

const MUSCLE_ICON: Record<string, string> = {
  chest: 'fitness', legs: 'fitness', back: 'fitness', core: 'motivation',
  shoulders: 'fitness', arms: 'fitness', full_body: 'analyze', cardio: 'cardio',
};

const TYPE_COLOR: Record<string, string> = {
  strength: colors.accent,
  cardio: '#FF8A5B',
  core: '#FF5C7A',
  flexibility: '#3DD68C',
};

const DIFFICULTY_COLOR: Record<string, string> = {
  beginner: '#3DD68C',
  intermediate: '#FFB84D',
  advanced: '#FF5C7A',
};

export default function WorkoutPlanScreen() {
  const { reelId } = useLocalSearchParams<{ reelId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    api.getWorkout(reelId)
      .then(p => { if (p.exercises.length === 0) setError('Workout plan not found.'); else setPlan(p); })
      .catch(() => setError('Workout plan not found.'))
      .finally(() => setLoading(false));
  }, [reelId]);

  const adjustValue = async (ex: WorkoutExercise, field: 'sets' | 'reps' | 'duration_seconds', delta: number) => {
    if (!plan) return;
    const current = ex[field] ?? (field === 'sets' ? 3 : field === 'reps' ? 10 : 30);
    const next = Math.max(1, current + delta);
    setUpdating(ex.id);
    try {
      const updated = await api.updateExercise(ex.id, { [field]: next });
      setPlan(p => p ? { ...p, exercises: p.exercises.map(e => e.id === updated.id ? updated : e) } : p);
    } finally {
      setUpdating(null);
    }
  };

  const totalSets = plan?.exercises.reduce((s, e) => s + (e.sets ?? 1), 0) ?? 0;

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.accent} size="large" /></View>;
  if (error || !plan) return (
    <View style={styles.center}>
      <Icon name="barbell-outline" size={48} color={colors.textTertiary} />
      <Text style={styles.errorText}>{error || 'Something went wrong.'}</Text>
    </View>
  );

  const Stepper = ({ ex, field, value, step = 1, label }: { ex: WorkoutExercise; field: 'sets' | 'reps' | 'duration_seconds'; value: number; step?: number; label: string }) => (
    <View style={styles.controlGroup}>
      <Text style={styles.controlLabel}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable style={styles.stepBtn} onPress={() => adjustValue(ex, field, -step)} disabled={updating === ex.id} scaleTo={0.85}>
          <Icon name="remove" size={18} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.stepValue}>{updating === ex.id ? '…' : value}</Text>
        <Pressable style={styles.stepBtn} onPress={() => adjustValue(ex, field, step)} disabled={updating === ex.id} scaleTo={0.85}>
          <Icon name="add" size={18} color={colors.textPrimary} />
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={styles.screen}>
      <AuroraBackground />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Gradient header */}
        <LinearGradient colors={gradients.vibrant} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
          <View style={styles.headerIcon}>
            <Icon name="barbell" size={22} color="#FFF" />
          </View>
          <Text style={styles.workoutName}>{plan.workout_name}</Text>
          <View style={styles.statRow}>
            <View style={styles.statChip}>
              <Text style={styles.statChipText}>{plan.difficulty}</Text>
            </View>
            <View style={styles.statChip}><Icon name="time" size={12} color="#FFF" /><Text style={styles.statChipText}>{plan.estimated_minutes} min</Text></View>
            <View style={styles.statChip}><Icon name="fitness" size={12} color="#FFF" /><Text style={styles.statChipText}>{plan.exercises.length} moves</Text></View>
            <View style={styles.statChip}><Icon name="repeat" size={12} color="#FFF" /><Text style={styles.statChipText}>{totalSets} sets</Text></View>
          </View>
        </LinearGradient>

        {/* Exercises */}
        {plan.exercises.map((ex, idx) => {
          const typeColor = TYPE_COLOR[ex.type] ?? colors.accent;
          return (
            <View key={ex.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.indexBadge}><Text style={styles.indexText}>{idx + 1}</Text></View>
                <Text style={styles.exerciseName} numberOfLines={2}>{ex.name}</Text>
                <Icon name={MUSCLE_ICON[ex.muscle_group] ?? 'fitness'} size={20} color={typeColor} />
              </View>

              <View style={styles.tagRow}>
                <View style={[styles.typeBadge, { backgroundColor: typeColor + '22' }]}>
                  <View style={[styles.typeDot, { backgroundColor: typeColor }]} />
                  <Text style={[styles.typeText, { color: typeColor }]}>{ex.type}</Text>
                </View>
                {ex.is_estimated && (
                  <View style={styles.estBadge}>
                    <Icon name="sparkles" size={9} color={colors.warning} />
                    <Text style={styles.estText}>AI estimated</Text>
                  </View>
                )}
              </View>

              <View style={styles.controls}>
                <Stepper ex={ex} field="sets" value={ex.sets ?? 3} label="SETS" />
                <Text style={styles.multiply}>×</Text>
                {ex.duration_seconds != null
                  ? <Stepper ex={ex} field="duration_seconds" value={ex.duration_seconds ?? 30} step={5} label="SECONDS" />
                  : <Stepper ex={ex} field="reps" value={ex.reps ?? 10} label="REPS" />}
                <View style={styles.restTag}>
                  <Text style={styles.restLabel}>REST</Text>
                  <Text style={styles.restValue}>{ex.rest_seconds}s</Text>
                </View>
              </View>
            </View>
          );
        })}

        <Disclaimer variant="fitness" style={{ marginTop: spacing.xs }} />
      </ScrollView>

      {/* Start button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Pressable style={styles.startWrap} onPress={() => router.push(`/workout/session/${reelId}`)} scaleTo={0.97}>
          <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.startBtn}>
            <Icon name="play" size={20} color="#FFF" />
            <Text style={styles.startBtnText}>Start Workout</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: 110, gap: spacing.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, gap: spacing.md },
  errorText: { color: colors.textSecondary, fontSize: font.md },

  header: { borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.sm, gap: spacing.sm, ...shadow.md },
  headerIcon: {
    width: 44, height: 44, borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center',
  },
  workoutName: { color: '#FFF', fontSize: font.xl, fontWeight: '800', letterSpacing: -0.5 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap', marginTop: spacing.xs },
  statChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: radius.full,
    paddingHorizontal: spacing.sm + 2, paddingVertical: 5,
  },
  statChipText: { color: '#FFF', fontSize: font.xs, fontWeight: '700', textTransform: 'capitalize' },

  card: {
    backgroundColor: colors.card, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  indexBadge: {
    width: 28, height: 28, borderRadius: radius.full,
    backgroundColor: colors.accent + '33', alignItems: 'center', justifyContent: 'center',
  },
  indexText: { color: colors.accentLight, fontSize: font.sm, fontWeight: '800' },
  exerciseName: { flex: 1, color: colors.textPrimary, fontSize: font.md, fontWeight: '700' },
  muscleEmoji: { fontSize: 20 },

  tagRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.full },
  typeDot: { width: 6, height: 6, borderRadius: 3 },
  typeText: { fontSize: 10, fontWeight: '800', textTransform: 'capitalize' },
  estBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.warning + '1A', paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.full },
  estText: { color: colors.warning, fontSize: 9, fontWeight: '700' },

  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap', marginTop: spacing.xs },
  controlGroup: { alignItems: 'center', gap: 4 },
  controlLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  stepBtn: {
    width: 34, height: 34, borderRadius: radius.full,
    backgroundColor: colors.cardElevated, borderWidth: 1, borderColor: colors.borderLight,
    alignItems: 'center', justifyContent: 'center',
  },
  stepValue: { color: colors.textPrimary, fontSize: font.xl, fontWeight: '800', minWidth: 38, textAlign: 'center' },
  multiply: { color: colors.textTertiary, fontSize: font.lg, marginTop: 16 },
  restTag: {
    marginLeft: 'auto' as any, backgroundColor: colors.surface, borderRadius: radius.md,
    paddingHorizontal: spacing.sm + 2, paddingVertical: 6, alignItems: 'center',
  },
  restLabel: { color: colors.textTertiary, fontSize: 9, letterSpacing: 1, fontWeight: '800' },
  restValue: { color: colors.textSecondary, fontSize: font.sm, fontWeight: '700' },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: spacing.md, paddingTop: spacing.md,
    backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.border,
  },
  startWrap: { borderRadius: radius.md, ...shadow.glow },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    borderRadius: radius.md, padding: spacing.md, minHeight: 56,
  },
  startBtnText: { color: '#FFF', fontSize: font.lg, fontWeight: '800' },
});
