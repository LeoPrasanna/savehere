import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Icon } from './Icon';
import { colors, spacing, radius, font, themed } from '../constants/theme';

/**
 * Small, consistent disclaimer chip. One place to tune the legal/safety copy that
 * the app is obliged to show wherever AI output or third-party content appears.
 *
 *  - ai        : any AI-generated text (answers, summaries) may be wrong.
 *  - fitness   : AI workout — not professional fitness/medical advice.
 *  - recipe    : AI recipe — verify ingredients/quantities/allergens.
 *  - ownership : we store links + summaries for personal reference; content is the creator's.
 *  - medical   : content flagged as medical/high-stakes advice — reference only,
 *                we're not responsible; consult a professional. (Tasks/workout
 *                are disabled for these saves, enforced server-side.)
 *  - health    : HEALTH-category save that the AI did NOT flag as high-stakes.
 *                Softer than `medical` (which is the flagged case and also
 *                disables action plans) but still says "not medical advice".
 *  - finance   : FINANCE-category save. Investment/tax/legal content carries
 *                real consequences, so this one is deliberately explicit that
 *                nothing here is financial advice and SaveHere isn't a licensed
 *                adviser.
 */
export type DisclaimerVariant =
  | 'ai' | 'fitness' | 'recipe' | 'ownership' | 'medical' | 'health' | 'finance';

const VARIANTS: Record<DisclaimerVariant, { icon: string; color: string; text: string }> = themed(() => ({
  ai: {
    icon: 'sparkles',
    color: colors.accentLight,
    // Don't promise direct editing — summaries aren't editable. The real
    // correction path is Notes + re-summarize, so point at that instead.
    text: 'AI-generated — it can be incomplete or wrong. Double-check anything important. To correct it, add details in Notes and re-summarize.',
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
  medical: {
    icon: 'shield',
    color: colors.danger,
    text: 'This content appears to contain medical or other sensitive advice. SaveHere keeps it for your reference only and is not responsible for how it\'s used — always consult a qualified professional before acting on it. Action plans are disabled for this save.',
  },
  health: {
    icon: 'shield',
    color: colors.warning,
    text: 'Health content — general information only, not medical advice, and not tailored to you. SaveHere isn\'t responsible for how it\'s used; talk to a doctor or qualified professional before acting on it.',
  },
  finance: {
    icon: 'shield',
    color: colors.warning,
    text: 'Finance content — general information only, not financial, investment, tax or legal advice. SaveHere is not a licensed adviser and isn\'t responsible for how this is used; markets carry risk and you can lose money. Speak to a qualified adviser before acting on it.',
  },
}));

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
