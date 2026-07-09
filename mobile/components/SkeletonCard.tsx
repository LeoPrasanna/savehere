import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '../constants/theme';

/**
 * SkeletonCard — content-shaped loading placeholder for the library grid.
 * A gentle opacity pulse (no shimmer sweep); the pulse stops existing the
 * moment real cards replace it, so the loop never competes with content.
 */
export function SkeletonCard({ index = 0 }: { index?: number }) {
  const pulse = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, delay: index * 90, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.55, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.View style={[styles.card, { opacity: pulse }]}>
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
        <View key={i} style={{ width: `${100 / columns}%`, padding: spacing.xs }}>
          <SkeletonCard index={i} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.md - spacing.xs,
    paddingTop: spacing.xs,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cover: { width: '100%', aspectRatio: 16 / 10, backgroundColor: colors.cardElevated },
  body: { padding: spacing.sm + 2, gap: 7 },
  line: { height: 10, borderRadius: 5, backgroundColor: colors.cardElevated },
  thin: { height: 8 },
});
