import { View, StyleSheet } from 'react-native';
import { MotiView } from 'moti';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * Ambient "aurora" backdrop: a dark gradient base with a few large, soft,
 * slowly-drifting color blobs. Replaces the flat black for a premium, alive feel.
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
      <Blob id="aurora-a" color="#8B7DFF" size={460} start={{ x: -40, y: -30 }} drift={{ x: 30, y: 40 }} position={{ top: -120, left: -80 }} duration={11000} />
      <Blob id="aurora-b" color="#FF6B9D" size={380} start={{ x: 0, y: 0 }} drift={{ x: -40, y: 50 }} position={{ top: 80, right: -100 }} duration={9000} />
      <Blob id="aurora-c" color="#5BC0FF" size={420} start={{ x: 0, y: 0 }} drift={{ x: 40, y: -40 }} position={{ bottom: -140, left: 20 }} duration={13000} />
    </View>
  );
}
