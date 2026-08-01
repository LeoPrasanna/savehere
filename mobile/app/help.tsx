import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { FEATURES } from '../constants/features';
import { Label, Body, Title, Rule, Index } from '../components/kit';
import { colors, spacing, font, tracking, typeface, themed } from '../constants/theme';

export default function HelpScreen() {
  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Title>Not just a bookmark.</Title>
        <Body style={styles.sub}>
          Everything SaveHere can do with what you save.
        </Body>

        <View style={styles.list}>
          <Rule />
          {FEATURES.map((f, i) => (
            <View key={f.title}>
              <View style={styles.row}>
                <Index n={i + 1} style={styles.index} />
                <View style={styles.text}>
                  <Text style={styles.title}>{f.title}</Text>
                  <Body style={styles.detail}>{f.detail}</Body>
                </View>
              </View>
              <Rule />
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  sub: { marginTop: spacing.md, fontSize: font.sm, lineHeight: 20 },

  list: { marginTop: spacing.xl },
  row: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.lg },
  index: { width: 22, paddingTop: 4 },
  text: { flex: 1, minWidth: 0, gap: spacing.sm },
  title: {
    color: colors.textPrimary,
    fontFamily: typeface.display,
    fontSize: font.lg,
    letterSpacing: tracking.heading,
  },
  detail: { fontSize: font.sm, lineHeight: 20 },
}));
