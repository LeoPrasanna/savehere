import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Label } from './kit';
import { colors, spacing, font, typeface, themed } from '../constants/theme';

/**
 * Small, consistent disclaimer block. One place to tune the legal/safety copy
 * that the app is obliged to show wherever AI output or third-party content
 * appears.
 *
 *  - ai        : any AI-generated text (answers, summaries) may be wrong.
 *  - fitness   : AI workout — not professional fitness/medical advice.
 *  - recipe    : AI recipe — verify ingredients/quantities/allergens.
 *  - ownership : we store links + summaries for personal reference; content is the creator's.
 *  - medical   : content flagged as medical/high-stakes advice — reference only,
 *                we're not responsible; consult a professional. (Tasks/workout
 *                are disabled for these saves, enforced server-side.)
 *  - health    : HEALTH-category save the AI did NOT flag as high-stakes.
 *  - finance   : FINANCE-category save. Investment/tax/legal content carries
 *                real consequences, so this one is deliberately explicit.
 *
 * ⚠️ SEVERITY USED TO BE A COLOUR (amber tint vs red tint). This system is
 * achromatic, so it is now carried by two things that survive any palette: a
 * heading that states the claim outright ("NOT MEDICAL ADVICE"), and a full ink
 * border on the high-stakes variants against a hairline on the rest. That is
 * strictly better than what it replaces — amber-vs-red was never distinguishable
 * to a red-green colourblind reader, and these are the notices that matter most.
 */
export type DisclaimerVariant =
  | 'ai' | 'fitness' | 'recipe' | 'ownership' | 'medical' | 'health' | 'finance';

const VARIANTS: Record<DisclaimerVariant, { heading: string; text: string; strong?: boolean }> = {
  ai: {
    heading: 'AI-generated',
    // Don't promise direct editing — summaries aren't editable. The real
    // correction path is Notes + re-summarize, so point at that instead.
    text: 'It can be incomplete or wrong. Double-check anything important. To correct it, add details in Notes and re-summarize.',
  },
  fitness: {
    heading: 'Not fitness advice',
    text: 'AI-generated workout, not professional fitness or medical advice. Work within your limits and check with a professional if unsure.',
  },
  recipe: {
    heading: 'Check before cooking',
    text: 'AI-generated recipe — double-check ingredients, quantities and allergens before cooking.',
  },
  ownership: {
    heading: 'Personal reference only',
    text: 'Findable stores links and AI summaries for personal reference only. Saved content belongs to its original creators.',
  },
  medical: {
    heading: 'Not medical advice',
    text: "This content appears to contain medical or other sensitive advice. Findable keeps it for your reference only and is not responsible for how it's used — always consult a qualified professional before acting on it. Action plans are disabled for this save.",
    strong: true,
  },
  health: {
    heading: 'Not medical advice',
    text: "Health content — general information only, and not tailored to you. Findable isn't responsible for how it's used; talk to a doctor or qualified professional before acting on it.",
    strong: true,
  },
  finance: {
    heading: 'Not financial advice',
    text: "Finance content — general information only, not financial, investment, tax or legal advice. Findable is not a licensed adviser and isn't responsible for how this is used; markets carry risk and you can lose money. Speak to a qualified adviser before acting on it.",
    strong: true,
  },
};

export function Disclaimer({ variant, style }: { variant: DisclaimerVariant; style?: StyleProp<ViewStyle> }) {
  const v = VARIANTS[variant];
  return (
    <View style={[styles.box, v.strong && styles.boxStrong, style]}>
      <Label wide tone={v.strong ? 'ink' : 'muted'}>{v.heading}</Label>
      <Text style={styles.text}>{v.text}</Text>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  box: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.ghostLine,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
  },
  // High-stakes: a full-strength border, so it reads as a boundary rather than
  // a footnote even at a glance.
  boxStrong: { borderColor: colors.textPrimary },
  text: {
    color: colors.textSecondary,
    fontFamily: typeface.body,
    fontSize: font.sm,
    lineHeight: 19,
  },
}));
