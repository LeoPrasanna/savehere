import { View, StyleSheet } from 'react-native';
import { colors, radius, shadow } from '../constants/theme';

/**
 * GlassCard — now a flat, quietly elevated card (the glassmorphism look is
 * retired). Name and props are kept so existing call sites don't change:
 * `tint` maps to a hairline border accent, `intensity` to surface elevation.
 */

interface GlassCardProps {
  children: React.ReactNode;
  style?: object;
  tint?: 'violet' | 'cyan' | 'pink' | 'none';
  intensity?: 'low' | 'medium' | 'high';
}

const BORDER_MAP = {
  violet: colors.accent + '2E',
  cyan: '#5FC9BD2E',
  pink: '#FF6B8A2E',
  none: colors.border,
};

export function GlassCard({ children, style, tint = 'none', intensity = 'medium' }: GlassCardProps) {
  const bg = intensity === 'high' ? colors.cardElevated : colors.card;
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: bg, borderColor: BORDER_MAP[tint] },
        intensity === 'high' && shadow.sm,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
});
