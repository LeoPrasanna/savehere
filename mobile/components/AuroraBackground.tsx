import { View, StyleSheet } from 'react-native';
import { MotiView } from 'moti';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * Enhanced AuroraBackground — deep space ambient backdrop with layered,
 * slowly-drifting color blobs, a subtle starfield grid, and a horizon glow.
 * Purely decorative — pointerEvents none so it never blocks touches.
 */

type BlobProps = {
  id: string;
  color: string;
  size: number;
  start: { x: number; y: number };
  drift: { x: number; y: number };
  position: object;
  duration?: number;
};

function Blob({ id, color, size, start, drift, position, duration = 9000 }: BlobProps) {
  return (
    <MotiView
      pointerEvents="none"
      style={[{ position: 'absolute', width: size, height: size }, position]}
      from={{ translateX: start.x, translateY: start.y, scale: 1 }}
      animate={{ translateX: drift.x, translateY: drift.y, scale: 1.18 }}
      transition={{ type: 'timing', duration, loop: true, repeatReverse: true }}
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={0.5} />
            <Stop offset="60%" stopColor={color} stopOpacity={0.18} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
      </Svg>
    </MotiView>
  );
}

export function AuroraBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={['#0B0A0F', '#130F1E', '#0B0A0F']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Deep space nebula blobs */}
      <Blob id="aurora-a" color="#8B7DFF" size={520} start={{ x: -40, y: -30 }} drift={{ x: 30, y: 40 }} position={{ top: -140, left: -100 }} duration={12000} />
      <Blob id="aurora-b" color="#FF6B9D" size={440} start={{ x: 0, y: 0 }} drift={{ x: -40, y: 50 }} position={{ top: 60, right: -120 }} duration={9500} />
      <Blob id="aurora-c" color="#5BC0FF" size={480} start={{ x: 0, y: 0 }} drift={{ x: 40, y: -40 }} position={{ bottom: -160, left: 10 }} duration={14000} />
      <Blob id="aurora-d" color="#BD00FF" size={360} start={{ x: 20, y: -20 }} drift={{ x: -30, y: 30 }} position={{ bottom: 100, right: -60 }} duration={11000} />

      {/* Subtle starfield dots */}
      <View style={styles.starfield} pointerEvents="none">
        {STAR_POSITIONS.map((s, i) => (
          <MotiView
            key={i}
            from={{ opacity: 0.2 }}
            animate={{ opacity: [0.2, 0.8, 0.2] }}
            transition={{ type: 'timing', duration: 2000 + i * 300, loop: true, repeatReverse: true }}
            style={[styles.star, { left: s.x, top: s.y, width: s.size, height: s.size }]}
          />
        ))}
      </View>
    </View>
  );
}

const STAR_POSITIONS = [
  { x: '10%', y: '12%', size: 2 }, { x: '25%', y: '8%', size: 1.5 }, { x: '45%', y: '15%', size: 2 },
  { x: '70%', y: '10%', size: 1.5 }, { x: '85%', y: '18%', size: 2 }, { x: '92%', y: '5%', size: 1 },
  { x: '15%', y: '30%', size: 1.5 }, { x: '55%', y: '25%', size: 2 }, { x: '78%', y: '32%', size: 1 },
  { x: '5%', y: '50%', size: 2 }, { x: '35%', y: '45%', size: 1.5 }, { x: '65%', y: '55%', size: 2 },
  { x: '90%', y: '48%', size: 1.5 }, { x: '20%', y: '70%', size: 1 }, { x: '50%', y: '68%', size: 2 },
  { x: '80%', y: '75%', size: 1.5 }, { x: '10%', y: '88%', size: 2 }, { x: '40%', y: '85%', size: 1 },
  { x: '60%', y: '92%', size: 1.5 }, { x: '88%', y: '90%', size: 2 },
];

const styles = StyleSheet.create({
  starfield: { ...StyleSheet.absoluteFillObject },
  star: {
    position: 'absolute',
    borderRadius: 99,
    backgroundColor: '#FFFFFF',
  },
});
