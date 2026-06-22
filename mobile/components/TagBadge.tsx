import { Text, View, StyleSheet } from 'react-native';
import { colors, radius, spacing, font } from '../constants/theme';

export function TagBadge({ tag }: { tag: string }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.text}>#{tag}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: colors.tagBg,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginRight: spacing.xs,
    marginBottom: spacing.xs,
  },
  text: {
    color: colors.tagText,
    fontSize: font.xs,
    fontWeight: '500',
  },
});
