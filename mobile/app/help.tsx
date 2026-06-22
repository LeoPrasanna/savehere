import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Icon } from '../components/Icon';
import { AuroraBackground } from '../components/AuroraBackground';
import { FEATURES } from '../constants/features';
import { colors, spacing, font, radius } from '../constants/theme';

export default function HelpScreen() {
  return (
    <View style={styles.screen}>
      <AuroraBackground />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sub}>SaveHere isn't just a bookmark — here's everything it can do with your saves.</Text>

        {FEATURES.map(f => (
          <View key={f.title} style={styles.card}>
            <View style={[styles.iconWrap, { backgroundColor: f.color + '22' }]}>
              <Icon name={f.icon} size={20} color={f.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{f.title}</Text>
              <Text style={styles.cardDetail}>{f.detail}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxl },
  sub: { color: colors.textSecondary, fontSize: font.sm, lineHeight: 20, marginBottom: spacing.xs },
  card: {
    flexDirection: 'row', gap: spacing.sm,
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md,
  },
  iconWrap: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardTitle: { color: colors.textPrimary, fontSize: font.md, fontWeight: '800', marginBottom: 4 },
  cardDetail: { color: colors.textSecondary, fontSize: font.sm, lineHeight: 20 },
});
