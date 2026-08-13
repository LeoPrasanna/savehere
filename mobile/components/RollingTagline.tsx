import { useState, useEffect, useRef, memo } from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle, TextStyle } from 'react-native';
import { MotiView, AnimatePresence } from 'moti';
import { rollTravel } from './rollGeometry';
import { colors, spacing, font, themed } from '../constants/theme';

/**
 * A vertical roll of one-line taglines: the incoming line rises from below into a
 * sharp centre while the outgoing one recedes and fades upward. A fixed-height
 * viewport with overflow:hidden clips both at the edges so they read as rolling in
 * and out. Focus is conveyed with opacity + scale (real text blur isn't reliable
 * cross-platform in RN). Used on the login screen and the landing page.
 *
 * Keep lines tight enough to fit the viewport without a third wrapped line.
 */
export const APP_TAGLINES = [
  'Your AI second brain for everything you scroll past.',
  "That reel you saved to 'watch later'? Now you'll actually find it.",
  'Every save gets summarized — you keep the idea, not just the link.',
  'Stop re-scrolling to re-find things. Just ask your library.',
  'Save it once — your AI second brain remembers the rest.',
  'Paste a link, get the gist, get on with your day.',
  'Your saves: organized, summarized, and actually searchable.',
  'Ask your library a question — it answers from what you saved.',
  'Never lose a good idea to the endless scroll again.',
  'The recipe, the workout, the tip — saved as something you can use.',
];

const INTERVAL_MS = 4000;

/** Viewport heights. These are the budget the roll's travel is derived from —
 *  see the note at the `travel` calculation. COMPACT was 42, which fits two
 *  18px lines with 3px to spare and therefore could not roll them without
 *  slicing; 60 leaves 12px each side, enough for a real roll. */
const DEFAULT_H = 52;
const COMPACT_H = 60;

interface Props {
  style?: StyleProp<ViewStyle>;
  /** Override the copy — e.g. the to-do dashboard rolls quotes through the same
   *  animation. Defaults to the app taglines used on login/landing. */
  lines?: readonly string[];
  /** Small variant for denser surfaces (the to-do header). */
  compact?: boolean;
  /** Restyle the rolling line — e.g. the to-do screen rolls its own name as a
   *  page hero rather than a caption. */
  textStyle?: StyleProp<TextStyle>;
  /** Viewport height must grow with the text, or a hero line gets clipped. */
  height?: number;
  /** Seconds between lines. */
  intervalMs?: number;
  /** Clamp each line (a long rolling name must not wrap out of the viewport). */
  numberOfLines?: number;
  /** Left-align instead of centring — for a line that sits beside fixed text. */
  alignLeft?: boolean;
  /** Random order instead of walking the list top to bottom. */
  shuffle?: boolean;
}

/**
 * A shuffle BAG, not `Math.random()` per tick.
 *
 * Picking independently at random would repeat lines back-to-back and leave
 * others unseen for ages — which reads as broken, not random. Dealing a fresh
 * permutation and walking it means every line shows once per cycle, in an order
 * that changes each pass. `avoidFirst` stops a new deal from opening on the
 * line the previous one just closed with, which is the one repeat a bag can
 * still produce.
 */
function shuffledIndices(n: number, avoidFirst?: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  if (n > 1 && avoidFirst !== undefined && a[0] === avoidFirst) {
    [a[0], a[1]] = [a[1], a[0]];
  }
  return a;
}

function RollingTaglineImpl({
  style, lines = APP_TAGLINES, compact, textStyle, height,
  intervalMs = INTERVAL_MS, numberOfLines, alignLeft, shuffle,
}: Props) {
  // Start on a random line so it feels fresh each open.
  const [i, setI] = useState(() => Math.floor(Math.random() * lines.length));

  const bag = useRef<number[]>([]);
  const pos = useRef(0);

  useEffect(() => {
    // A changed list invalidates the current deal.
    bag.current = [];
    pos.current = 0;
    const t = setInterval(() => setI(current => {
      const len = lines.length;
      if (len <= 1) return 0;
      if (!shuffle) return (current + 1) % len;
      if (pos.current >= bag.current.length) {
        bag.current = shuffledIndices(len, current);
        pos.current = 0;
      }
      return bag.current[pos.current++];
    }), intervalMs);
    return () => clearInterval(t);
  }, [lines.length, intervalMs, shuffle]);

  // A shorter list swapped in after mount could leave the index out of range.
  const line = lines[i % lines.length];

  const textStyles = [styles.text, compact && styles.textCompact, textStyle];

  /**
   * ⚠️ THE TRAVEL DISTANCE IS DERIVED, NOT A CONSTANT. This is the real fix for
   * "the Slate lines are cut off" (owner, reported twice).
   *
   * The roll worked by translating ±22px inside a fixed-height viewport with
   * `overflow: hidden`. That is fine for ONE line — a 42px window holding 18px
   * of text has 12px of slack each side. It is impossible for TWO: 36px of text
   * in the same window leaves 3px, so an 11px offset (the midpoint of the
   * animation, where opacity is still ~0.5) sliced roughly a fifth of the text
   * clean off. No amount of shortening the quotes fixed that, because it was
   * never about the text — it was about the geometry. It only *looked* fixed
   * whenever a quote happened to fit on one line.
   *
   * So the travel is now whatever actually fits: half the leftover space, never
   * more. Worst case the headroom is zero and this degrades to a pure
   * crossfade, which is the correct thing to do when there is no room to move.
   * A caller can no longer configure a clipping roll.
   *
   * ⚠️ The knock-on: the to-do HERO (height 40, ~30px of display type) had only
   * ~5px of slack, so it was quietly being clipped too — nobody reported it
   * because a big single line flies out fast. Its roll is now subtler and
   * correct. Give it more `height` if it should be dramatic again.
   */
  // ⚠️ Both numbers come from the SAME flattened style arrays the Text and the
  // View actually render with — not from the props. `app/index.tsx` sets the
  // viewport height through `style` rather than the `height` prop, and the
  // to-do hero overrides lineHeight through `textStyle`; reading the props
  // alone would have computed a travel for a box that isn't the rendered one,
  // which is the same "looks fixed until it isn't" trap as before.
  const viewportStyles = [styles.viewport, compact && styles.viewportCompact, height ? { height } : null, style];
  const flatViewport = StyleSheet.flatten(viewportStyles);
  const lineHeight = StyleSheet.flatten(textStyles)?.lineHeight ?? (compact ? 18 : 22);
  const viewportH = typeof flatViewport?.height === 'number'
    ? flatViewport.height
    : (compact ? COMPACT_H : DEFAULT_H);
  const travel = rollTravel(viewportH, lineHeight, numberOfLines ?? 2);

  return (
    <View style={viewportStyles}>
      <AnimatePresence>
        <MotiView
          key={i}
          style={[styles.slot, alignLeft && styles.slotLeft]}
          from={{ opacity: 0, translateY: travel, scale: 0.94 }}
          animate={{ opacity: 1, translateY: 0, scale: 1 }}
          exit={{ opacity: 0, translateY: -travel, scale: 0.94 }}
          transition={{ type: 'timing', duration: 600 }}
        >
          <Text style={textStyles} numberOfLines={numberOfLines}>
            {line}
          </Text>
        </MotiView>
      </AnimatePresence>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  viewport: { height: DEFAULT_H, overflow: 'hidden', alignSelf: 'stretch' },
  viewportCompact: { height: COMPACT_H },
  slotLeft: { alignItems: 'flex-start' },
  textCompact: { fontSize: font.sm, lineHeight: 18, fontStyle: 'italic', fontWeight: '500' },
  slot: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  text: {
    color: colors.textSecondary, fontSize: font.md, fontWeight: '600',
    textAlign: 'center', paddingHorizontal: spacing.md, lineHeight: 22,
  },
}));

/** Memoized so a parent re-render doesn't re-run this subtree (AnimatePresence +
 *  MotiView) — its own interval still re-renders it, which is local and cheap. */
export const RollingTagline = memo(RollingTaglineImpl);
