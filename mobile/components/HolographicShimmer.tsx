import { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';

/**
 * HolographicShimmer — a sweeping light beam that travels across a card,
 * giving a futuristic "holographic" or "premium digital" feel.
 * Place it as an absolute child inside any card or surface.
 */

interface HolographicShimmerProps {
  width: number;
  height: number;
  color?: string;
  duration?: number;
  delay?: number;
}

export function HolographicShimmer({
  width,
  height,
  color = 'rgba(255,255,255,0.12)',
  duration = 2500,
  delay = 0,
}: HolographicShimmerProps) {
  const translateX = useRef(new Animated.Value(-width)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(translateX, {
          toValue: width,
          duration,
          useNativeDriver: true,
        }),
        Animated.delay(3000),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [width, duration, delay]);

  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} pointerEvents="none">
      <Animated.View
        style={{
          width: width * 0.4,
          height,
          transform: [{ translateX }, { skewX: '-20deg' }],
          backgroundColor: color,
        }}
      />
    </View>
  );
}
