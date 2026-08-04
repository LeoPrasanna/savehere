import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Label } from './kit';
import { colors, spacing, font, tracking, typeface, themed } from '../constants/theme';

/**
 * Today's completion progress against the user's daily goal.
 *
 * "Today" is the DEVICE's calendar day: the count comes from `completed_on`,
 * which the client stamps in local time. So the reset happens at the user's own
 * midnight with no scheduled job to run — there is nothing to fire, and nothing
 * that can get stuck and leave yesterday's number on screen.
 *
 * `done` may exceed `goal` (finishing 7 against a goal of 5 is a good day, not
 * an error); the marks clamp but the label keeps the real number.
 *
 * ⚠️ Was a filled bar that turned green on completion. Achromatic now, so it is
 * one mark PER TASK: five marks for a goal of five, filled as you go. That reads
 * as "three of five" instantly where a part-filled grey bar reads as "some" —
 * and hitting the goal is a full row of marks, which needs no colour at all.
 */
interface Props {
  done: number;
  goal: number;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Above this, per-task marks get too thin to see and it falls back to a bar. */
const MAX_MARKS = 12;

export function TodoGoalBar({ done, goal, compact, style }: Props) {
  if (goal <= 0) return null;                    // goal switched off in settings
  const hit = done >= goal;
  const marks = Math.min(goal, MAX_MARKS);
  const perMark = goal / marks;

  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.labelRow}>
        <Label numberOfLines={1}>{hit ? "Today's goal met" : "Today's goal"}</Label>
        <Text style={[styles.count, hit && styles.countHit]}>{done}/{goal}</Text>
      </View>

      <View style={styles.track}>
        {Array.from({ length: marks }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.mark,
              compact && styles.markCompact,
              i * perMark < done && styles.markOn,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  wrap: { gap: spacing.xs },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  count: {
    color: colors.textSecondary,
    fontFamily: typeface.label,
    fontSize: font.xs,
    letterSpacing: tracking.label,
    fontVariant: ['tabular-nums'],
  },
  countHit: { color: colors.textPrimary },
  track: { flexDirection: 'row', gap: 3 },
  mark: { flex: 1, height: 5, backgroundColor: colors.ghostLine },
  markCompact: { height: 3 },
  markOn: { backgroundColor: colors.textPrimary },
}));
