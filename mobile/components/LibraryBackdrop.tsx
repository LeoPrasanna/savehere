import { View, StyleSheet } from 'react-native';
import { MotiView } from 'moti';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';

/**
 * LibraryBackdrop — ambient warmth behind the library.
 *
 * `full` (empty library): drifting ember glows + slowly rising motes, like
 * sparks over a fire — the screen feels alive while there's nothing saved yet.
 * `ambient` (grid visible): two whisper-quiet glows only; thumbnails stay the
 * loudest thing on screen. Purely decorative — pointerEvents none.
 */

function Glow({ id, color, size, drift, position, duration = 12000, opacity = 0.22 }: {
  id: string; color: string; size: number;
  drift: { x: number; y: number };
  position: object; duration?: number; opacity?: number;
}) {
  return (
    <MotiView
      pointerEvents="none"
      style={[{ position: 'absolute', width: size, height: size }, position]}
      from={{ translateX: 0, translateY: 0, scale: 1 }}
      animate={{ translateX: drift.x, translateY: drift.y, scale: 1.12 }}
      transition={{ type: 'timing', duration, loop: true, repeatReverse: true }}
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={opacity} />
            <Stop offset="65%" stopColor={color} stopOpacity={opacity * 0.35} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
      </Svg>
    </MotiView>
  );
}

// Fixed positions so the field looks composed, not random each render.
const MOTES = [
  { x: '14%', bottom: 90, size: 5, delay: 0, duration: 5200 },
  { x: '32%', bottom: 40, size: 4, delay: 900, duration: 6100 },
  { x: '55%', bottom: 120, size: 6, delay: 1800, duration: 4800 },
  { x: '71%', bottom: 60, size: 4, delay: 400, duration: 6600 },
  { x: '86%', bottom: 100, size: 5, delay: 1300, duration: 5600 },
  { x: '44%', bottom: 30, size: 3, delay: 2300, duration: 7000 },
] as const;

function Motes() {
  return (
    <>
      {MOTES.map((m, i) => (
        <MotiView
          key={i}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: m.x,
            bottom: m.bottom,
            width: m.size,
            height: m.size,
            borderRadius: m.size / 2,
            backgroundColor: '#FFB35C',
          }}
          from={{ opacity: 0, translateY: 30 }}
          animate={{ opacity: [0, 0.65, 0], translateY: -180 }}
          transition={{ type: 'timing', duration: m.duration, delay: m.delay, loop: true }}
        />
      ))}
    </>
  );
}

export function LibraryBackdrop({ mode }: { mode: 'full' | 'ambient' }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {mode === 'full' ? (
        <>
          <Glow id="lib-a" color="#FF6B3D" size={480} drift={{ x: 40, y: 50 }} position={{ top: -120, left: -110 }} duration={13000} opacity={0.26} />
          <Glow id="lib-b" color="#FFB35C" size={420} drift={{ x: -50, y: 30 }} position={{ top: 180, right: -140 }} duration={10000} opacity={0.2} />
          <Glow id="lib-c" color="#C9552F" size={460} drift={{ x: 30, y: -40 }} position={{ bottom: -150, left: 40 }} duration={15000} opacity={0.22} />
          <Motes />
        </>
      ) : (
        <>
          <Glow id="lib-d" color="#FF6B3D" size={420} drift={{ x: 30, y: 40 }} position={{ top: -160, right: -150 }} duration={16000} opacity={0.1} />
          <Glow id="lib-e" color="#C9552F" size={380} drift={{ x: -30, y: -30 }} position={{ bottom: -170, left: -120 }} duration={18000} opacity={0.08} />
        </>
      )}
    </View>
  );
}
