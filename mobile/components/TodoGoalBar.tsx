import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { MotiView } from 'moti';
import { Icon } from './Icon';
import { colors, spacing, font, radius, themed } from '../constants/theme';

/**
 * Today's completion progress against the user's daily goal.
 *
 * "Today" is the DEVICE's calendar day: the count comes from `completed_on`,
 * which the client stamps in local time. So the reset happens at the user's own
 * midnight with no scheduled job to run — there is nothing to fire, and nothing
 * that can get stuck and leave yesterday's number on screen.
 *
 * `done` may exceed `goal` (finishing 7 against a goal of 5 is a good day, not
 * an error); the bar clamps but the label keeps the real number.
 */
interface Props {
  done: number;
  goal: number;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function TodoGoalBar({ done, goal, compact, style }: Props) {
  if (goal <= 0) return null;                    // goal switched off in settings
  const hit = done >= goal;
  const pct = Math.min(100, Math.round((done / goal) * 100));

  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, compact && styles.labelCompact]} numberOfLines={1}>
          {hit ? "Today's goal met" : "Today's goal"}
        </Text>
        <View style={styles.countRow}>
          {hit && <Icon name="flame" size={compact ? 11 : 13} color={colors.success} />}
          <Text style={[styles.count, compact && styles.labelCompact, hit && styles.countHit]}>
            {done}/{goal}
          </Text>
        </View>
      </View>

      <View style={[styles.track, compact && styles.trackCompact]}>
        <MotiView
          // Animated so completing a task visibly moves the bar — the payoff
          // that makes the goal feel worth chasing.
          animate={{ width: `${pct}%` }}
          transition={{ type: 'timing', duration: 420 }}
          style={[styles.fill, hit && styles.fillHit]}
        />
      </View>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  wrap: { gap: 5 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { color: colors.textSecondary, fontSize: font.xs, fontWeight: '700' },
  labelCompact: { fontSize: 10 },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  count: { color: colors.textSecondary, fontSize: font.xs, fontWeight: '800' },
  countHit: { color: colors.success },
  track: {
    height: 6, borderRadius: radius.full,
    backgroundColor: colors.border, overflow: 'hidden',
  },
  trackCompact: { height: 4 },
  fill: { height: '100%', borderRadius: radius.full, backgroundColor: colors.accent },
  fillHit: { backgroundColor: colors.success },
}));
