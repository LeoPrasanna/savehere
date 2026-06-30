import { View, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, spacing } from '../constants/theme';

/**
 * GlassCard — a reusable glassmorphism card wrapper with a subtle
 * translucent background, border highlight, and optional gradient tint.
 * Use this anywhere you want a futuristic, premium elevated surface.
 */

interface GlassCardProps {
  children: React.ReactNode;
  style?: object;
  tint?: 'violet' | 'cyan' | 'pink' | 'none';
  intensity?: 'low' | 'medium' | 'high';
}

const TINT_MAP = {
  violet: ['rgba(139,125,255,0.08)', 'rgba(139,125,255,0.02)'] as const,
  cyan: ['rgba(91,192,255,0.08)', 'rgba(91,192,255,0.02)'] as const,
  pink: ['rgba(255,107,157,0.08)', 'rgba(255,107,157,0.02)'] as const,
  none: ['rgba(28,25,36,0.55)', 'rgba(28,25,36,0.35)'] as const,
};

const BORDER_MAP = {
  violet: 'rgba(139,125,255,0.25)',
  cyan: 'rgba(91,192,255,0.25)',
  pink: 'rgba(255,107,157,0.25)',
  none: 'rgba(62, 58, 72, 0.6)',
};

export function GlassCard({ children, style, tint = 'none', intensity = 'medium' }: GlassCardProps) {
  const opacity = intensity === 'low' ? 0.35 : intensity === 'high' ? 0.75 : 0.55;
  const bg = TINT_MAP[tint];
  const border = BORDER_MAP[tint];

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: `rgba(28,25,36,${opacity})`,
          borderColor: border,
        },
        style,
      ]}
    >
      <LinearGradient
        colors={bg}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Top edge highlight */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 16,
          right: 16,
          height: 1,
          backgroundColor: border,
          opacity: 0.6,
        }}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 20,
      },
      default: { elevation: 10 },
    }),
  },
});
