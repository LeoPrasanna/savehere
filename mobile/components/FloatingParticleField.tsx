import { useEffect, useRef, useMemo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { MotiView } from 'moti';

/**
 * FloatingParticleField — ambient floating glowing particles that drift
 * across the screen. Adds a layer of futuristic "digital space" atmosphere
 * to any screen. Purely decorative, pointerEvents none.
 */

const { width: W, height: H } = Dimensions.get('window');

const PARTICLE_COUNT = 24;
const COLORS = ['#8B7DFF', '#FF6B9D', '#5BC0FF', '#BD00FF', '#00F0FF'];

interface Particle {
  key: number;
  x: number;
  y: number;
  size: number;
  color: string;
  duration: number;
  delay: number;
  driftX: number;
  driftY: number;
  opacity: number;
}

export function FloatingParticleField() {
  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: PARTICLE_COUNT }).map((_, i) => ({
      key: i,
      x: Math.random() * W,
      y: Math.random() * H,
      size: 2 + Math.random() * 4,
      color: COLORS[i % COLORS.length],
      duration: 8000 + Math.random() * 12000,
      delay: Math.random() * 5000,
      driftX: (Math.random() - 0.5) * 80,
      driftY: (Math.random() - 0.5) * 80,
      opacity: 0.2 + Math.random() * 0.5,
    }));
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((p) => (
        <MotiView
          key={p.key}
          from={{
            translateX: p.x,
            translateY: p.y,
            opacity: p.opacity * 0.5,
            scale: 0.8,
          }}
          animate={{
            translateX: [p.x, p.x + p.driftX, p.x],
            translateY: [p.y, p.y + p.driftY, p.y],
            opacity: [p.opacity * 0.5, p.opacity, p.opacity * 0.5],
            scale: [0.8, 1.2, 0.8],
          }}
          transition={{
            type: 'timing',
            duration: p.duration,
            delay: p.delay,
            loop: true,
            repeatReverse: true,
          }}
          style={{
            position: 'absolute',
            width: p.size,
            height: p.size,
            borderRadius: p.size / 2,
            backgroundColor: p.color,
            shadowColor: p.color,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.8,
            shadowRadius: p.size * 2,
          }}
        />
      ))}
    </View>
  );
}
