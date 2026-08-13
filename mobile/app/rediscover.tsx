import { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, FlatList, ActivityIndicator, useWindowDimensions } from 'react-native';
import { api, Reel } from '../services/api';
import { MascotLoader } from '../components/MascotLoader';
import { ReelCard } from '../components/ReelCard';
import { Label, Body, Title, Rule } from '../components/kit';
import { TAB_BAR_CLEARANCE } from '../components/TabBar';
import { markDeleted, unmarkDeleted } from '../services/libraryEdits';
import { colors, spacing, font, GRID_GAP, columnsForWidth, themed } from '../constants/theme';

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
  // ⚠️ WAS `width < 600 ? 2 : width < 1024 ? 3 : 4` — the exact formula round 1
  // identified as the reason grids looked wrong on a tablet. That fix was
  // applied to app/index.tsx and never to this screen, so Rediscover kept the
  // bug the whole time. One shared function now, so it cannot drift again.
  const numColumns = columnsForWidth(width);
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
    return <View style={styles.center}><MascotLoader label="Finding something worth a second look" /></View>;
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Label wide>Offline</Label>
        <Title style={styles.emptyTitle}>Couldn't load your saves</Title>
        <Body style={styles.emptyText}>Make sure the server is running, then try again.</Body>
      </View>
    );
  }

  if (picks.length === 0) {
    return (
      <View style={styles.center}>
        <Label wide>Empty sheet</Label>
        <Title style={styles.emptyTitle}>Nothing to rediscover yet</Title>
        <Body style={styles.emptyText}>
          Save a few links — they'll resurface here so they don't get forgotten.
        </Body>
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
        // Same gutter as the library grid — one constant, no drift.
        columnWrapperStyle={{ gap: GRID_GAP, paddingHorizontal: GRID_GAP }}
        ListHeaderComponent={
          <View style={styles.head}>
            <Body style={styles.sub}>
              A few past saves worth a second look — revisit them, act on them, or clear them out.
            </Body>
            <Rule />
          </View>
        }
        renderItem={({ item, index }) => (
          item.__ghost
            ? <View style={{ flex: 1 }} />
            /* ⚠️ The API call lives HERE, not in ReelCard — the card stopped
               firing it (and silently swallowing failures) so the screen that
               owns the list can report the outcome. `markDeleted` keeps the
               row out of the library's own refetch while the request is in
               flight. */
            : <ReelCard reel={item} index={index} onDelete={id => {
                markDeleted(id);
                setReels(prev => prev.filter(r => r.id !== id));
                api.deleteReel(id).catch(() => unmarkDeleted(id));
              }} />
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  list: { paddingBottom: TAB_BAR_CLEARANCE + spacing.xl, gap: GRID_GAP },
  head: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.lg },
  sub: { fontSize: font.sm, lineHeight: 20 },
  emptyTitle: { marginTop: spacing.xs },
  emptyText: { fontSize: font.sm, lineHeight: 20, maxWidth: 420 },
}));
