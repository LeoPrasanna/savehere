import { useEffect } from 'react';
import Svg, { Rect } from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedProps, withRepeat, withTiming, Easing,
} from 'react-native-reanimated';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

interface Props {
  width: number;
  height: number;
  radius?: number;
  color?: string;
  strokeWidth?: number;
  duration?: number;
}

/**
 * A bright light segment that continuously travels around a rounded-rect border.
 * Done with a single SVG stroke (dash segment + animated dash offset) — one
 * shared value, so it's cheap.
 */
export function BorderBeam({
  width, height, radius = 16, color = '#B6AEFF', strokeWidth = 2.5, duration = 2600,
}: Props) {
  const w = Math.max(0, width - strokeWidth);
  const h = Math.max(0, height - strokeWidth);
  const perimeter = 2 * (w + h);
  const dash = Math.max(36, perimeter * 0.22); // length of the travelling light

  const offset = useSharedValue(0);
  useEffect(() => {
    offset.value = 0;
    offset.value = withRepeat(withTiming(perimeter, { duration, easing: Easing.linear }), -1, false);
  }, [perimeter, duration]);

  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: -offset.value }));

  if (width <= 0 || height <= 0) return null;

  return (
    <Svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0 }} pointerEvents="none">
      <AnimatedRect
        x={strokeWidth / 2}
        y={strokeWidth / 2}
        width={w}
        height={h}
        rx={radius}
        ry={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={`${dash},${perimeter - dash}`}
        strokeLinecap="round"
        animatedProps={animatedProps}
      />
    </Svg>
  );
}
