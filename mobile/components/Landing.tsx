import { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MotiView } from 'moti';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../services/api';
import { Pressable } from './Pressable';
import { Icon } from './Icon';
import { Label, Wordmark } from './kit';
import { colors, spacing, font, tracking, typeface, radius, themed } from '../constants/theme';
import { useAuth } from '../contexts/AuthContext';
import { emitUi } from '../services/uiBus';
import { ASK_MIN_REELS } from '../constants/limits';
import { TAB_BAR_CLEARANCE } from './TabBar';
import { getSaveCount, hydrateSaveCount, rememberSaveCount } from '../services/saveCount';

/**
 * The home screen — "editorial hero" (variant D7, owner-selected 2026-08-03).
 *
 * ── What this replaced, and why ──────────────────────────────────────────────
 * The old landing stacked a greeting, a rolling tip, an Ask row, a to-do block
 * with two columns, a category chip strip, a recent carousel and a four-line
 * disclaimer. Every one of those was defensible alone; together they were a
 * menu of eight destinations on a screen the user opens to do ONE thing.
 *
 * This is a statement and a single input. Everything the old screen linked to is
 * a tab away — Library, Slate and Ask are all in the tab bar now, so repeating
 * them here was pure duplication. The category chips duplicated the Library's
 * own filter; the disclaimer moved to where it is actually read.
 *
 * ── The one idea worth preserving ────────────────────────────────────────────
 * THE INPUT NEVER MOVES. It sits in the same place at every library size and
 * only changes what it accepts:
 *
 *     0 saves        paste a link      "Save it. Then ask it."
 *     1..MIN-1       paste a link      "…and two to go."   + unlock ticks
 *     MIN+           ask a question    "You saved it. Now ask it."
 *
 * So the gesture learned on day one keeps working and simply gets more
 * powerful. Most apps ship a throwaway empty state; this is the same screen.
 *
 * ⚠️ The three-state ladder is NOT cosmetic — Ask is genuinely gated at
 * `ASK_MIN_REELS` (see app/ask.tsx, which enforces it independently). Showing an
 * "ask" affordance below that threshold would point at a locked feature, so the
 * threshold is imported, never hardcoded.
 *
 * ⚠️ NO SERIF. The approved mockup rendered the hero in a serif face; the app is
 * one family (Inter) and the owner asked for strict consistency in the same
 * breath. "Editorial" here is the composition — one large left-aligned
 * statement, a quiet supporting line, a pinned action — not a second typeface.
 */

/** Both taps hand off to a screen that already owns the job — this screen holds
 *  no paste or ask logic of its own, so there is one implementation of each. */
type Stage = 'empty' | 'learning' | 'ready';

export function Landing({ onEnter }: { onEnter: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { displayName } = useAuth();
  // ⚠️ SEEDED FROM THE LAST KNOWN COUNT, not null. Starting at null fell through
  // to the zero-save stage, so a user with 63 saves was shown "Save it. Then ask
  // it." for as long as the request took — measured at 21s against staging.
  // See services/saveCount.ts.
  const [total, setTotal] = useState<number | null>(getSaveCount);
  const [fetchError, setFetchError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => { hydrateSaveCount().then(n => setTotal(t => t ?? n)); }, []);

  // Only the COUNT is needed, so ask for one row rather than a page of twenty.
  // The old screen pulled twelve reels plus the whole to-do list to render
  // blocks this design no longer has.
  useFocusEffect(useCallback(() => {
    setFetchError(false);
    api.listReels({ limit: 1 })
      .then(d => { setTotal(d.total); rememberSaveCount(d.total); })
      .catch(() => setFetchError(true));
  }, [attempt]));

  // An error only takes over the screen when there is nothing remembered to
  // show. With a known count the screen stays useful and the failure is a
  // quiet line — the count being a few minutes stale is not worth a full stop.
  const blocked = fetchError && total === null;

  const stage: Stage =
    total === null ? 'empty'
    : total === 0 ? 'empty'
    : total < ASK_MIN_REELS ? 'learning'
    : 'ready';

  const remaining = ASK_MIN_REELS - (total ?? 0);

  const copy = {
    empty: {
      head: 'Save it.\nThen ask it.',
      sub: 'Paste anything you’ve been meaning to come back to. The summary writes itself.',
    },
    learning: {
      head: `${total} in.\n${remaining} to go.`,
      sub: `Questions unlock at ${ASK_MIN_REELS} saves — they need a little to draw on.`,
    },
    ready: {
      head: 'You saved it.\nNow ask it.',
      sub: 'Every reel, short and post you kept — answerable in a sentence.',
    },
  }[stage];

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Wordmark size={22} />
        <Pressable
          style={styles.menuBtn}
          onPress={() => emitUi('openProfile')}
          accessibilityRole="button"
          accessibilityLabel="Menu"
        >
          <Icon name="menu" size={17} color={colors.textPrimary} />
        </Pressable>
      </View>

      <View style={styles.body}>
        <Text style={styles.hero}>
          {blocked ? 'Can’t reach\nthe server.' : copy.head}
        </Text>
        <Text style={styles.sub}>
          {blocked
            ? 'Your saves are safe — this screen just couldn’t load. The backend may be waking up.'
            : copy.sub}
        </Text>

        {/* A real button, because this screen does not scroll — the copy it
            replaces told the user to "pull down" on a view with nothing to
            pull. */}
        {blocked && (
          <Pressable
            style={styles.retry}
            onPress={() => setAttempt(a => a + 1)}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <Label tone="ink" wide>Try again</Label>
          </Pressable>
        )}

        {/* Known count, failed refresh: say so, don't hijack the screen. */}
        {fetchError && total !== null && (
          <Label style={styles.stale}>Showing your last known count</Label>
        )}

        {/* The unlock ladder, only while it means something. Discrete ticks
            rather than a bar: "3 of 5" reads instantly, a part-filled bar
            reads as "some". Same grammar the Ask screen's own gate uses. */}
        {stage === 'learning' && (
          <View style={styles.ticks}>
            {Array.from({ length: ASK_MIN_REELS }).map((_, i) => (
              <View key={i} style={[styles.tick, i < (total ?? 0) && styles.tickOn]} />
            ))}
          </View>
        )}
      </View>

      {/* ── The input. Same position at every stage; only its job changes. ──
          A Pressable shaped like the composer rather than a live field: the
          paste flow lives on /save and the ask flow on /ask, both of which
          already handle clipboard permissions, validation, quota and errors.
          Duplicating either here would be a second implementation to keep in
          sync — and the first one to drift. */}
      <View style={[styles.dock, { paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }]}>
        <Pressable
          style={styles.composer}
          onPress={() => router.push(stage === 'ready' ? '/ask' : '/save')}
          accessibilityRole="button"
          accessibilityLabel={stage === 'ready' ? 'Ask your library' : 'Paste a link to save'}
        >
          {stage === 'ready' ? (
            // High-emphasis and animated — this is the card's whole purpose, and
            // a static save count read as a label rather than an invitation.
            <MotiView
              from={{ opacity: 0.55, translateY: 3 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: 320, loop: false }}
              style={{ flex: 1 }}
            >
              <Text style={styles.composerAsk}>ASK YOUR LIBRARY</Text>
            </MotiView>
          ) : (
            <Text style={styles.composerText}>Paste a link</Text>
          )}
          <Icon
            name={stage === 'ready' ? 'arrow-forward' : 'copy'}
            size={15}
            color={colors.textPrimary}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  menuBtn: {
    width: 36, height: 36,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.ghostLine,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Vertically centred rather than top-aligned: with only two blocks on the
  // screen, hanging them off the top leaves a dead lower half.
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.lg },
  hero: {
    color: colors.textPrimary,
    fontFamily: typeface.display,
    fontSize: font.display,
    lineHeight: font.display * 1.08,
    letterSpacing: tracking.display,
  },
  sub: {
    color: colors.textSecondary,
    fontFamily: typeface.body,
    fontSize: font.md,
    lineHeight: font.md * 1.5,
    marginTop: spacing.md,
    maxWidth: 420,
  },

  retry: {
    alignSelf: 'flex-start',
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.textPrimary,
    borderRadius: radius.full,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
  },
  stale: { marginTop: spacing.md },

  ticks: { flexDirection: 'row', gap: 4, marginTop: spacing.xl },
  tick: { flex: 1, height: 4, borderRadius: radius.full, backgroundColor: colors.ghostLine },
  tickOn: { backgroundColor: colors.textPrimary },

  dock: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.full,
    paddingVertical: 14,
    paddingHorizontal: spacing.md + 2,
  },
  composerText: {
    color: colors.textSecondary,
    fontFamily: typeface.body,
    fontSize: font.md,
  },
  composerAsk: {
    color: colors.textPrimary,
    fontFamily: typeface.display,
    fontSize: font.md,
    fontWeight: '800',
    letterSpacing: tracking.label,
  },
}));
