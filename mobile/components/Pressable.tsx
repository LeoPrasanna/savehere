import { useRef, ReactNode } from 'react';
import { Animated, Pressable as RNPressable, ViewStyle, StyleProp, GestureResponderEvent, LayoutChangeEvent } from 'react-native';
import { motion } from '../constants/theme';

interface Props {
  children?: ReactNode;
  onPress?: (e: GestureResponderEvent) => void;
  onLayout?: (e: LayoutChangeEvent) => void;
  style?: StyleProp<ViewStyle>;
  /** Ignored — kept so ~30 existing call sites don't need editing. See below. */
  scaleTo?: number;
  disabled?: boolean;
  hitSlop?: number | { top?: number; bottom?: number; left?: number; right?: number };
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'link' | 'none';
}

// Animate the Pressable itself (single node) so layout styles — position, flex,
// width — apply directly. Wrapping it in an extra view traps absolute/flex children.
const AnimatedPressable = Animated.createAnimatedComponent(RNPressable);

/**
 * Tap target that DIMS on press.
 *
 * ⚠️ It used to spring-scale to 0.96. Julia Krantz's motion rule is explicit:
 * "interactive states change text opacity or image brightness only" — a contact
 * sheet whose tiles bounce under the finger is a contradiction, and at 0 radius
 * a scaling rectangle reads as a glitch rather than a press.
 *
 * `scaleTo` is retained as a NO-OP prop so the ~30 call sites passing it keep
 * compiling. Delete the prop in a later sweep; it is not worth a 30-file diff.
 */
export function Pressable({
  children, onPress, onLayout, style, disabled, hitSlop,
  accessibilityLabel, accessibilityRole = 'button',
}: Props) {
  const opacity = useRef(new Animated.Value(1)).current;

  const to = (v: number) =>
    Animated.timing(opacity, {
      toValue: v,
      duration: motion.micro,
      useNativeDriver: true,
    }).start();

  return (
    <AnimatedPressable
      onPress={onPress}
      onLayout={onLayout}
      onPressIn={() => !disabled && to(motion.pressOpacity)}
      onPressOut={() => to(1)}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      style={[style, { opacity }]}
    >
      {children}
    </AnimatedPressable>
  );
}
