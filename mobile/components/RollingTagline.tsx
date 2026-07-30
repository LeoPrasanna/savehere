import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { MotiView, AnimatePresence } from 'moti';
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

interface Props {
  style?: StyleProp<ViewStyle>;
  /** Override the copy — e.g. the to-do dashboard rolls quotes through the same
   *  animation. Defaults to the app taglines used on login/landing. */
  lines?: readonly string[];
  /** Small variant for denser surfaces (the to-do header). */
  compact?: boolean;
}

export function RollingTagline({ style, lines = APP_TAGLINES, compact }: Props) {
  // Start on a random line so it feels fresh each open, then advance one at a time.
  const [i, setI] = useState(() => Math.floor(Math.random() * lines.length));
  useEffect(() => {
    const t = setInterval(() => setI(n => (n + 1) % lines.length), INTERVAL_MS);
    return () => clearInterval(t);
  }, [lines.length]);

  // A shorter list swapped in after mount could leave the index out of range.
  const line = lines[i % lines.length];

  return (
    <View style={[styles.viewport, compact && styles.viewportCompact, style]}>
      <AnimatePresence>
        <MotiView
          key={i}
          style={styles.slot}
          from={{ opacity: 0, translateY: 22, scale: 0.94 }}
          animate={{ opacity: 1, translateY: 0, scale: 1 }}
          exit={{ opacity: 0, translateY: -22, scale: 0.94 }}
          transition={{ type: 'timing', duration: 600 }}
        >
          <Text style={[styles.text, compact && styles.textCompact]}>{line}</Text>
        </MotiView>
      </AnimatePresence>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  viewport: { height: 52, overflow: 'hidden', alignSelf: 'stretch' },
  viewportCompact: { height: 42 },
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
