import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors, spacing, themed } from '../constants/theme';

/**
 * Content-shaped loading placeholder for the library grid.
 *
 * Matches the real frame exactly — 3:4 portrait, hairline seam, no radius, no
 * gutter — so nothing shifts when the real tiles land. A gentle opacity pulse
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
      <View style={styles.cover} />
      <View style={styles.body}>
        <View style={[styles.line, { width: '85%' }]} />
        <View style={[styles.line, { width: '60%' }]} />
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
        <View key={i} style={{ width: `${100 / columns}%` }}>
          <SkeletonCard index={i} />
        </View>
      ))}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  // No page margin and no gutter — the real grid is full-bleed and flush, and a
  // skeleton that isn't would make the whole page jump on load.
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  frame: {
    borderWidth: 0.5,
    borderColor: colors.ghostLine,
  },
  cover: { width: '100%', aspectRatio: 3 / 4, backgroundColor: colors.card },
  body: { padding: spacing.sm, gap: 6 },
  line: { height: 9, backgroundColor: colors.card },
  thin: { height: 7 },
}));
