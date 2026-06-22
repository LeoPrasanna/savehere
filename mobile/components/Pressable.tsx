import { useRef, ReactNode } from 'react';
import { Animated, Pressable as RNPressable, ViewStyle, StyleProp, GestureResponderEvent } from 'react-native';

interface Props {
  children?: ReactNode;
  onPress?: (e: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  disabled?: boolean;
  hitSlop?: number | { top?: number; bottom?: number; left?: number; right?: number };
}

// Animate the Pressable itself (single node) so layout styles — position, flex,
// width — apply directly. Wrapping it in an extra view traps absolute/flex children.
const AnimatedPressable = Animated.createAnimatedComponent(RNPressable);

/**
 * Tap target with a spring scale-down on press. Used everywhere for tactile feel.
 */
export function Pressable({ children, onPress, style, scaleTo = 0.96, disabled, hitSlop }: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (to: number) =>
    Animated.spring(scale, {
      toValue: to,
      useNativeDriver: true,
      speed: 50,
      bounciness: 6,
    }).start();

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => !disabled && animateTo(scaleTo)}
      onPressOut={() => animateTo(1)}
      disabled={disabled}
      hitSlop={hitSlop}
      style={[style, { transform: [{ scale }] }]}
    >
      {children}
    </AnimatedPressable>
  );
}
