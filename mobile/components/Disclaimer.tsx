import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Icon } from './Icon';
import { colors, spacing, radius, font } from '../constants/theme';

/**
 * Small, consistent disclaimer chip. One place to tune the legal/safety copy that
 * the app is obliged to show wherever AI output or third-party content appears.
 *
 *  - ai        : any AI-generated text (answers, summaries) may be wrong.
 *  - fitness   : AI workout — not professional fitness/medical advice.
 *  - recipe    : AI recipe — verify ingredients/quantities/allergens.
 *  - ownership : we store links + summaries for personal reference; content is the creator's.
 */
export type DisclaimerVariant = 'ai' | 'fitness' | 'recipe' | 'ownership';

const VARIANTS: Record<DisclaimerVariant, { icon: string; color: string; text: string }> = {
  ai: {
    icon: 'sparkles',
    color: colors.accentLight,
    text: 'AI-generated — it can be incomplete or wrong. Double-check anything important; you can edit it anytime.',
  },
  fitness: {
    icon: 'shield',
    color: colors.warning,
    text: 'AI-generated workout — not professional fitness or medical advice. Work within your limits and check with a professional if unsure.',
  },
  recipe: {
    icon: 'information-circle',
    color: colors.warning,
    text: 'AI-generated recipe — double-check ingredients, quantities and allergens before cooking.',
  },
  ownership: {
    icon: 'information-circle',
    color: colors.textTertiary,
    text: 'SaveHere stores links and AI summaries for personal reference only. Saved content belongs to its original creators.',
  },
};

export function Disclaimer({ variant, style }: { variant: DisclaimerVariant; style?: StyleProp<ViewStyle> }) {
  const v = VARIANTS[variant];
  return (
    <View style={[styles.row, { borderColor: v.color + '33', backgroundColor: v.color + '0F' }, style]}>
      <Icon name={v.icon} size={13} color={v.color} style={{ marginTop: 1 }} />
      <Text style={styles.text}>{v.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.sm,
  },
  text: { flex: 1, color: colors.textSecondary, fontSize: font.xs, lineHeight: 16 },
});
