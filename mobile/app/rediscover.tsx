import { useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, useWindowDimensions } from 'react-native';
import { api, Reel } from '../services/api';
import { ReelCard } from '../components/ReelCard';
import { Icon } from '../components/Icon';
import { colors, spacing, font } from '../constants/theme';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function RediscoverScreen() {
  const { width } = useWindowDimensions();
  const numColumns = width < 600 ? 2 : width < 1024 ? 3 : 4;
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.listReels()
      .then(d => setReels(d.items))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  // Resurface up to 6, biased toward older saves (the ones you'd forget).
  const picks = useMemo(() => {
    if (reels.length <= 6) return shuffle(reels);
    const olderHalf = reels.slice(Math.floor(reels.length / 2)); // list is newest-first
    return shuffle(olderHalf).slice(0, 6);
  }, [reels]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.accent} size="large" /></View>;
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Icon name="alert-circle" size={40} color={colors.danger} />
        <Text style={styles.emptyTitle}>Couldn't load your saves</Text>
        <Text style={styles.emptyText}>Make sure the server is running, then try again.</Text>
      </View>
    );
  }

  if (picks.length === 0) {
    return (
      <View style={styles.screen}>
        <View style={styles.center}>
          <Icon name="rediscover" size={44} color={colors.textTertiary} />
          <Text style={styles.emptyTitle}>Nothing to rediscover yet</Text>
          <Text style={styles.emptyText}>Save a few reels — we'll resurface them here so they don't get forgotten.</Text>
        </View>
      </View>
    );
  }

  const fillers = picks.length % numColumns === 0 ? 0 : numColumns - (picks.length % numColumns);
  const gridData: any[] = fillers
    ? [...picks, ...Array.from({ length: fillers }, (_, i) => ({ id: `__ghost_${i}`, __ghost: true }))]
    : picks;

  return (
    <View style={styles.screen}>
      <FlatList
        data={gridData}
        keyExtractor={(r: any) => r.id}
        numColumns={numColumns}
        key={numColumns}
        columnWrapperStyle={{ gap: spacing.sm }}
        ListHeaderComponent={
          <Text style={styles.sub}>A few past saves worth a second look — revisit them, act on them, or clear them out.</Text>
        }
        renderItem={({ item, index }) => (
          item.__ghost
            ? <View style={{ flex: 1 }} />
            : <ReelCard reel={item} index={index} onDelete={id => setReels(prev => prev.filter(r => r.id !== id))} />
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  list: { padding: spacing.md, gap: spacing.sm },
  sub: { color: colors.textSecondary, fontSize: font.sm, lineHeight: 20, marginBottom: spacing.md },
  emptyTitle: { color: colors.textPrimary, fontSize: font.lg, fontWeight: '700', marginTop: spacing.sm },
  emptyText: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'center', lineHeight: 20 },
});
