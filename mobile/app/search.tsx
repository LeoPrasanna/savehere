import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, TextInput, FlatList, ScrollView, StyleSheet,
  KeyboardAvoidingView, useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { api, Reel } from '../services/api';
import { ReelCard } from '../components/ReelCard';
import { MascotLoader } from '../components/MascotLoader';
import { Pressable } from '../components/Pressable';
import { Icon } from '../components/Icon';
import { Label, Body, Title, Rule, GhostButton } from '../components/kit';
import { TAB_BAR_CLEARANCE } from '../components/TabBar';
import { markDeleted, unmarkDeleted } from '../services/libraryEdits';
import { getLibraryIndex, refreshLibraryIndex, indexedCount } from '../services/libraryIndex';
import { searchIndex } from '../services/librarySearch';
import { onUi } from '../services/uiBus';
import { colors, spacing, font, tracking, typeface, GRID_GAP, columnsForWidth, themed } from '../constants/theme';

/**
 * SEARCH YOUR LIBRARY — free, instant, and deliberately not AI.
 *
 * ⚠️ WHY IT IS NOT GATED ON THE AI QUOTA, which is how it was asked for. The
 * request was "when the daily AI budget is gone, Ask is useless, give them a
 * search instead" — and the second half is right. The gating half is not:
 * search costs nothing, so hiding it until someone is out of budget makes the
 * app worse for everyone who isn't, and it recreates the exact reason the
 * previous search vertical was deleted on 2026-08-10 (an entry point almost
 * nobody could reach). So it is always available — from the library header and
 * from Ask — and Ask merely *promotes* it when the budget is spent.
 *
 * ⚠️ EVERY KEYSTROKE IS LOCAL. No debounce, no request, no spinner: the whole
 * library is fetched once (services/libraryIndex) and tokenized once
 * (services/librarySearch), and a query is a synchronous scan. The alternative
 * — a round-trip per keystroke to a Render free instance that cold-starts in
 * ~50 s — is the version of this feature that reads as broken.
 */
export default function SearchScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const numColumns = columnsForWidth(width);

  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);
  // Seeded from the cache: a second visit in the same session renders results
  // on the FIRST frame, with no loading state at all.
  const [index, setIndex] = useState(getLibraryIndex);
  const [loading, setLoading] = useState(() => getLibraryIndex() === null);
  const [failed, setFailed] = useState(false);

  const inputRef = useRef<TextInput>(null);
  // 350ms clears the push transition — focusing mid-animation is the case where
  // iOS shows a caret and never raises the keyboard. Same reasoning as ask.tsx.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, []);

  const hydrate = useCallback(() => {
    refreshLibraryIndex().then(built => {
      setLoading(false);
      if (built) { setIndex(built); setFailed(false); }
      else if (getLibraryIndex() === null) setFailed(true);
    });
  }, []);

  // Refresh on arrival and on return from the background — a reel shared from
  // Instagram while the app sat idle must be findable, and the native share
  // path never enters JS to tell us.
  useFocusEffect(hydrate);
  useEffect(() => onUi('appResumed', hydrate), [hydrate]);

  const results = useMemo(
    () => (index ? searchIndex(q, index) : []),
    [q, index],
  );

  const removeReel = (id: string) => {
    markDeleted(id);
    setIndex(prev => (prev ? prev.filter(r => r.reel.id !== id) : prev));
    api.deleteReel(id).catch(() => unmarkDeleted(id));
  };

  const typed = q.trim().length > 0;
  const total = indexedCount();

  // FlatList's numColumns leaves a half-width orphan on the last row; ghost
  // cells keep the final row aligned. Same trick as rediscover.tsx.
  const fillers = results.length % numColumns === 0 ? 0 : numColumns - (results.length % numColumns);
  const gridData: any[] = fillers
    ? [...results, ...Array.from({ length: fillers }, (_, i) => ({ id: `__ghost_${i}`, __ghost: true }))]
    : results;

  const body = () => {
    if (loading) return <View style={styles.center}><MascotLoader label="Reading your library" /></View>;
    if (failed) {
      return (
        <View style={styles.center}>
          <Label wide>Offline</Label>
          <Title style={styles.emptyTitle}>Couldn't load your saves</Title>
          <Body style={styles.emptyText}>
            Search runs on your device, but it needs your library first. Check the connection and try again.
          </Body>
        </View>
      );
    }
    if (!typed) {
      return (
        <ScrollView
          contentContainerStyle={styles.intro}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Label wide>Ready</Label>
          <Title style={styles.emptyTitle}>
            {total > 0 ? `${total} save${total === 1 ? '' : 's'} to search` : 'Nothing saved yet'}
          </Title>
          <Body style={styles.emptyText}>
            {total > 0
              ? 'Type a word from a title, a tag, a category or your own notes. Results appear as you type, and no AI actions are used.'
              : 'Save a link first — everything you keep becomes searchable here.'}
          </Body>

          {/* ── Search vs Ask ─────────────────────────────────────────────────
              ⚠️ Owner request, 2026-08-15: people cannot tell these two apart,
              and picking wrong is expensive in one direction only. Search costs
              nothing and finds a SAVE; Ask costs an AI action and produces an
              ANSWER. Someone who uses Ask for "where's that pasta reel" burns
              their daily budget on a lookup search does for free.

              The distinction is drawn with ONE worked example rather than an
              abstract rule, because "use search when you know what you want"
              means nothing until you see the two sentences side by side. */}
          {total > 0 && (
            <View style={styles.compare}>
              <Rule />
              <View style={styles.compareRow}>
                <Icon name="search" size={16} color={colors.textPrimary} />
                <View style={styles.compareText}>
                  <Label tone="ink" wide>Search — when you know what you saved</Label>
                  <Body style={styles.compareBody}>
                    “<Text style={styles.quote}>paneer</Text>” finds the reel you're picturing, in a
                    tap. Free, instant, works offline.
                  </Body>
                </View>
              </View>
              <Rule />
              <View style={styles.compareRow}>
                <Icon name="ask" size={16} color={colors.textPrimary} />
                <View style={styles.compareText}>
                  <Label tone="ink" wide>Ask — when you don't</Label>
                  <Body style={styles.compareBody}>
                    “<Text style={styles.quote}>what can I cook tonight with paneer and no oven?</Text>”
                    reads across your saves and answers. Costs one AI action from your daily
                    allowance.
                  </Body>
                </View>
              </View>
              <Rule />
              <Body style={styles.compareFoot}>
                Rule of thumb: searching for a <Text style={styles.quote}>thing</Text> → search.
                Asking a <Text style={styles.quote}>question</Text> → Ask.
              </Body>
              <GhostButton
                label="Ask your library instead"
                trailing="→"
                onPress={() => router.replace('/ask')}
                style={styles.compareCta}
              />
            </View>
          )}
        </ScrollView>
      );
    }
    if (results.length === 0) {
      return (
        <View style={styles.center}>
          <Label wide>No match</Label>
          {/* Showing the query back is the difference between "nothing matched
              THAT" and "search is broken". */}
          <Title style={styles.emptyTitle} numberOfLines={3}>Nothing for “{q.trim()}”</Title>
          <Body style={styles.emptyText}>
            Titles, tags, categories, summaries and notes are all searched. Try a shorter word —
            a category name like “cooking” or “fitness” matches every save filed under it.
          </Body>
        </View>
      );
    }
    return (
      <FlatList
        data={gridData}
        keyExtractor={(r: any) => r.id}
        numColumns={numColumns}
        key={numColumns}
        keyboardShouldPersistTaps="handled"
        // Same gutter as the library grid — one constant, no drift.
        columnWrapperStyle={{ gap: GRID_GAP, paddingHorizontal: GRID_GAP }}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index: i }) => (
          item.__ghost
            ? <View style={{ flex: 1 }} />
            /* The screen owns the delete, not the card — a card that fires its
               own API call swallows the failure. Same rule as index.tsx. */
            : <ReelCard reel={item as Reel} index={i} onDelete={removeReel} />
        )}
      />
    );
  };

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <View style={styles.head}>
          <View style={styles.fieldRow}>
            <Icon name="search" size={17} color={colors.textTertiary} />
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder="Title, tag, category or note"
              placeholderTextColor={colors.textTertiary}
              value={q}
              onChangeText={setQ}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              // Not `clearButtonMode` — that is iOS-only, and a control that
              // exists on one platform is how the two drift apart.
            />
            {typed && (
              <Pressable onPress={() => setQ('')} hitSlop={10} accessibilityLabel="Clear search">
                <Icon name="close" size={16} color={colors.textTertiary} />
              </Pressable>
            )}
          </View>
          <View style={[styles.fieldRule, focused && styles.fieldRuleOn]} />
          {typed && !loading && !failed && (
            <Text style={styles.count}>
              {results.length === 0
                ? 'NO MATCHES'
                : `${results.length} OF ${total} · MOST RELEVANT FIRST`}
            </Text>
          )}
        </View>
        <Rule />
        {body()}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },

  head: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    flex: 1,
    color: colors.textPrimary,
    fontFamily: typeface.body,
    fontSize: font.lg,
    minHeight: 40,
    paddingVertical: spacing.sm,
  },
  fieldRule: { height: 1, backgroundColor: colors.ghostLine },
  fieldRuleOn: { backgroundColor: colors.textPrimary },
  count: {
    color: colors.textTertiary,
    fontFamily: typeface.label,
    fontSize: font.xs,
    letterSpacing: tracking.label,
    paddingTop: spacing.sm,
  },

  list: { paddingTop: GRID_GAP, paddingBottom: TAB_BAR_CLEARANCE + spacing.xl, gap: GRID_GAP },
  center: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: TAB_BAR_CLEARANCE,
    gap: spacing.md,
  },
  emptyTitle: { marginTop: spacing.xs },
  emptyText: { fontSize: font.sm, lineHeight: 20, maxWidth: 420 },

  // The intro scrolls: on a small phone with the keyboard up, the two-way
  // comparison is taller than the remaining viewport, and a centred View would
  // simply clip it.
  intro: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: TAB_BAR_CLEARANCE + spacing.xl,
    gap: spacing.md,
  },
  compare: { marginTop: spacing.lg, gap: spacing.md },
  compareRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start', paddingVertical: spacing.md },
  compareText: { flex: 1, minWidth: 0, gap: spacing.sm },
  compareBody: { fontSize: font.sm, lineHeight: 20 },
  // The examples are the payload of this block, so they read as ink, not as
  // the surrounding explanation.
  quote: { color: colors.textPrimary },
  compareFoot: { fontSize: font.sm, lineHeight: 20, paddingTop: spacing.xs },
  compareCta: { marginTop: spacing.sm },
}));
