import { Text, View, StyleSheet } from 'react-native';
import { colors, spacing, font, tracking, typeface, themed } from '../constants/theme';

/**
 * A tag. Was a filled pill; is now a hairline-boxed tracked word — the same
 * grammar every other label in the system uses. The "#" is gone because
 * uppercase tracking already reads as a tag and the glyph was doing nothing.
 */
export function TagBadge({ tag }: { tag: string }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>{tag.toUpperCase()}</Text>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  badge: {
    borderWidth: 1,
    borderColor: colors.ghostLine,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    marginRight: spacing.xs,
    marginBottom: spacing.xs,
  },
  text: {
    color: colors.textSecondary,
    fontFamily: typeface.label,
    fontSize: font.xs,
    letterSpacing: tracking.label,
  },
}));
