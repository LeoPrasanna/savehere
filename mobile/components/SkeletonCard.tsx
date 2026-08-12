import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors, spacing, radius, GRID_GAP, themed } from '../constants/theme';

/**
 * Content-shaped loading placeholder for the library grid.
 *
 * Matches the real frame exactly — 3:4 portrait, radius.lg, same GRID_GAP — so
 * nothing shifts when the real tiles land. A gentle opacity pulse
 * (no shimmer sweep); the pulse stops existing the moment real cards replace it,
 * so the loop never competes with content.
 */
export function SkeletonCard({ index = 0 }: { index?: number }) {
  const pulse = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.75, duration: 700, delay: index * 90, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.View style={[styles.frame, { opacity: pulse }]}>
      {/* Two lines low in the frame, where the real tile's title overlay sits. */}
      <View style={styles.body}>
        <View style={[styles.line, { width: '85%' }]} />
        <View style={[styles.line, styles.thin, { width: '40%' }]} />
      </View>
    </Animated.View>
  );
}

/** A grid's worth of skeletons — drop-in for the library while loading. */
export function SkeletonGrid({ columns = 2, rows = 3 }: { columns?: number; rows?: number }) {
  return (
    <View style={styles.grid}>
      {Array.from({ length: columns * rows }).map((_, i) => (
        <View key={i} style={{ width: `${100 / columns}%`, padding: GRID_GAP / 2 }}>
          <SkeletonCard index={i} />
        </View>
      ))}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  // ⚠️ MUST MATCH THE REAL GRID. This renders on every category switch, and any
  // difference in spacing shows up as the whole page re-flowing the instant the
  // real tiles land. The gutter comes from each cell's half-gap padding
  // (GRID_GAP/2 + GRID_GAP/2 = GRID_GAP between neighbours), and the outer
  // padding gives the same space at the screen edge.
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: GRID_GAP / 2 },
  frame: {
    aspectRatio: 3 / 4,
    backgroundColor: colors.card,
    justifyContent: 'flex-end',
    // ⚠️ MUST TRACK ReelCard's frame radius (both `radius.lg`). Without it the
    // placeholder is square and every category switch flashes square blocks
    // that pop into rounded tiles — the same class of re-flow the GRID_GAP note
    // above exists to prevent, just on the corner instead of the gutter.
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  body: { padding: spacing.sm, gap: 6 },
  line: { height: 9, backgroundColor: colors.cardElevated },
  thin: { height: 7 },
}));
