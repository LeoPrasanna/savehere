import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle, AccessibilityInfo } from 'react-native';
import { MotiView, AnimatePresence } from 'moti';
import { Label } from './kit';
import { Icon } from './Icon';
import * as haptics from '../services/haptics';
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
 *
 * ── THE TWO-HANDED THUMBS-UP LIVES HERE (owner, 2026-08-10) ────────────────
 * It was first built into the to-do screen's LOADING state, firing when the
 * fetch came back. Research killed that: not one task app in the reference set
 * (Todoist Zero, Apple Books' Daily Goal, Opal, Drops) celebrates a network
 * response — every celebration is attached to something the PERSON did. Worse,
 * that screen already owns a real reward (the spring tick + ring burst on
 * completing a task), and spending a bigger version of the same gesture on a
 * page load teaches the user the gesture means nothing.
 *
 * So it moved to the one moment on this surface that is genuinely earned:
 * crossing the daily goal. It fires ONCE per crossing, not on every render
 * where `hit` happens to be true — see `celebrate` below, which is the whole
 * subtlety. Re-opening the screen with the goal already met is not an
 * achievement; crossing it while you are looking is.
 */
interface Props {
  done: number;
  goal: number;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Above this, per-task marks get too thin to see and it falls back to a bar. */
const MAX_MARKS = 12;

/** How long the two hands stay up after the goal is crossed. Short: this sits
 *  beside a number the user is reading, not on a screen of its own. */
const CELEBRATE_MS = 1800;

export function TodoGoalBar({ done, goal, compact, style }: Props) {
  const hit = goal > 0 && done >= goal;
  const [celebrate, setCelebrate] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  // undefined on the first render, so mounting with the goal already met is
  // correctly NOT a crossing.
  const wasHit = useRef<boolean | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(v => { if (alive) setReduceMotion(!!v); })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { alive = false; sub?.remove?.(); };
  }, []);

  useEffect(() => {
    const crossed = hit && wasHit.current === false;
    wasHit.current = hit;
    if (!crossed) return;
    haptics.success();
    setCelebrate(true);
    const t = setTimeout(() => setCelebrate(false), CELEBRATE_MS);
    return () => clearTimeout(t);
  }, [hit]);

  // ⚠️ After the hooks, never before — an early return above them would change
  // the hook order between renders the moment the goal is switched off.
  if (goal <= 0) return null;                    // goal switched off in settings
  const marks = Math.min(goal, MAX_MARKS);
  const perMark = goal / marks;

  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.labelRow}>
        <Label numberOfLines={1}>{hit ? "Today's goal met" : "Today's goal"}</Label>
        <View style={styles.countRow}>
          {/* Two hands, the right one mirrored on X so the pair reads as left
              and right rather than as the same glyph pasted twice. */}
          <AnimatePresence>
            {celebrate && (
              <>
                <MotiView
                  from={{ opacity: 0, scale: reduceMotion ? 1 : 0.4, translateY: reduceMotion ? 0 : 6 }}
                  animate={{ opacity: 1, scale: 1, translateY: 0 }}
                  exit={{ opacity: 0 }}
                  transition={reduceMotion
                    ? { type: 'timing', duration: 200 }
                    : { type: 'spring', damping: 11, stiffness: 220 }}
                >
                  <Icon name="thumbs-up" size={15} color={colors.textPrimary} />
                </MotiView>
                <MotiView
                  from={{ opacity: 0, scale: reduceMotion ? 1 : 0.4, translateY: reduceMotion ? 0 : 6 }}
                  animate={{ opacity: 1, scale: 1, translateY: 0 }}
                  exit={{ opacity: 0 }}
                  transition={reduceMotion
                    ? { type: 'timing', duration: 200 }
                    : { type: 'spring', damping: 11, stiffness: 220, delay: 70 }}
                  style={styles.mirror}
                >
                  <Icon name="thumbs-up" size={15} color={colors.textPrimary} />
                </MotiView>
              </>
            )}
          </AnimatePresence>
          <Text style={[styles.count, hit && styles.countHit]}>{done}/{goal}</Text>
        </View>
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
  countRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  mirror: { transform: [{ scaleX: -1 }] },
}));
