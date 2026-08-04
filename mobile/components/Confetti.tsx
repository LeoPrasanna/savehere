import { useMemo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { MotiView } from 'moti';

/**
 * Lightweight celebratory confetti. Hand-rolled on Moti (no native dependency) so
 * it runs identically on iOS, Android and web. Purely decorative — full-screen,
 * pointerEvents none, so it never blocks touches. Mount it briefly to play once.
 */
const COLORS = ['#FF6B3D', '#FFB35C', '#FF6B8A', '#5FC9BD', '#4FCE8F', '#F4C430'];
const PIECES = 32;

export function Confetti() {
  const { width, height } = Dimensions.get('window');

  const pieces = useMemo(
    () =>
      Array.from({ length: PIECES }).map((_, i) => {
        const size = 7 + Math.random() * 9;
        const dir = Math.random() > 0.5 ? 1 : -1;
        return {
          key: i,
          startX: Math.random() * width,
          drift: dir * (30 + Math.random() * 120),
          size,
          rounded: Math.random() > 0.5,
          color: COLORS[i % COLORS.length],
          delay: Math.random() * 450,
          duration: 1700 + Math.random() * 1500,
          rotate: `${dir * (240 + Math.floor(Math.random() * 360))}deg`,
        };
      }),
    [width],
  );

  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
      {pieces.map((p) => (
        <MotiView
          key={p.key}
          from={{ translateX: p.startX, translateY: -50, rotate: '0deg', opacity: 1 }}
          animate={{ translateX: p.startX + p.drift, translateY: height + 50, rotate: p.rotate, opacity: 0 }}
          transition={{ type: 'timing', duration: p.duration, delay: p.delay }}
          style={{
            position: 'absolute',
            width: p.size,
            height: p.rounded ? p.size : p.size * 0.5,
            borderRadius: p.rounded ? p.size : 2,
            backgroundColor: p.color,
          }}
        />
      ))}
    </View>
  );
}
