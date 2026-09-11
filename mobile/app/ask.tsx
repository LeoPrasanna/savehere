import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, ScrollView, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { api, AskResponse } from '../services/api';
import { Pressable } from '../components/Pressable';
import { Icon } from '../components/Icon';
import { Disclaimer } from '../components/Disclaimer';
import { Label, Body, Title, Rule, Index, GhostButton, FilledButton } from '../components/kit';
import { getSaveCount, hydrateSaveCount, rememberSaveCount } from '../services/saveCount';
import { getCachedUsage, refreshUsage, onUsage } from '../services/usageCache';
import { resumesAtSentence } from '../services/quotaReset';
import { ASK_MIN_REELS } from '../constants/limits';
import { TAB_BAR_CLEARANCE } from '../components/TabBar';
import { colors, spacing, font, tracking, typeface, themed } from '../constants/theme';

const SUGGESTIONS = [
  'What recipes have I saved?',
  'Any beginner workouts?',
  'Summarize what I saved about tech',
];

export default function AskScreen() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AskResponse | null>(null);
  const [streamingText, setStreamingText] = useState('');   // grows token-by-token
  const [error, setError] = useState('');
  const [focused, setFocused] = useState(false);

  const inputRef = useRef<TextInput>(null);
  /**
   * Save-count gate. The entry points already hide Ask below the threshold, but
   * a deep link or back-navigation can still land here, so the screen guards
   * itself too.
   *
   * ⚠️ SEEDED FROM THE REMEMBERED COUNT, NOT `null`.
   *
   * This started at `null`, and `locked` requires a non-null count — so for the
   * whole round-trip to /usage (seconds on a cold Render instance) a brand-new
   * user was shown the full working Ask screen, which then swapped to the
   * "save 5 reels first" lock under them. Showing someone a feature and then
   * taking it away is worse than never showing it.
   *
   * services/saveCount already persists this number for the home screen's
   * identical problem; reusing it means the lock is correct on the FIRST frame
   * for anyone who has opened the app before. The fetch still runs and
   * corrects it — and refreshes the stored value for next time.
   */
  const [savedCount, setSavedCount] = useState<number | null>(
    () => getCachedUsage()?.saves?.used ?? getSaveCount(),
  );
  /**
   * ⚠️ Ask is the one screen where an exhausted AI budget is a DEAD END, and it
   * showed no sign of it: a 429 arrived only after you typed a question and
   * tapped send, as one line of generic red text. Everything Ask does costs an
   * AI action, so there is nothing to try again.
   *
   * Seeded from the login-time cache so the notice is on the first frame, not
   * after a round-trip — a warning that arrives once you've typed has missed
   * its moment, the same reasoning as the save screen's.
   */
  const [usage, setUsage] = useState(getCachedUsage);

  useEffect(() => {
    let alive = true;
    // Native can't read the store synchronously at module load, so hydrate
    // first — otherwise native keeps flashing exactly the way web no longer does.
    hydrateSaveCount().then(n => {
      if (alive && n !== null) setSavedCount(c => (c === null ? n : c));
    });
    refreshUsage().then(u => {
      if (!alive || !u) return;
      setUsage(u);
      setSavedCount(u.saves.used);
      rememberSaveCount(u.saves.used);
    });
    return () => { alive = false; };
  }, []);

  /**
   * ⚠️ WITHOUT THIS, ASKING YOUR LAST QUESTION LEAVES THE BOX OPEN.
   *
   * `usage` was read once on mount, so `outOfAi` below still said false after
   * the action that spent the budget — and the empty-state work from the round
   * before (hide the field when `remaining === 0`) only took effect on a
   * remount. The screen that spends the quota was the last to know it had.
   *
   * `askStream` reports its own spend now (see api.ts), so subscribing is what
   * turns that into something the user sees.
   */
  useEffect(() => onUsage(setUsage), []);

  const locked = savedCount !== null && savedCount < ASK_MIN_REELS;
  // null (never fetched) must NOT read as exhausted — a wrong "you're out"
  // shown to someone with budget is worse than showing it a moment late.
  const outOfAi = usage != null && usage.remaining === 0;

  /**
   * Open the keyboard on arrival — you came here to type a question.
   *
   * A timer rather than `autoFocus`: the screen transition is still animating on
   * mount, and focusing mid-transition is the case where iOS shows the caret but
   * never raises the keyboard. 350ms clears the push animation.
   *
   * ⚠️ Skipped when the budget is gone or the save gate is closed — in both
   * states the field is not rendered at all, so raising a keyboard for it would
   * be a keyboard over nothing. It re-runs if `outOfAi` resolves late (the
   * cached usage can arrive after mount), so the normal case still autofocuses.
   */
  useEffect(() => {
    if (outOfAi || locked) return;
    const t = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, [outOfAi, locked]);

  const ask = async (question: string) => {
    const text = question.trim();
    if (text.length < 3) { setError('Ask a real question — a few words at least.'); return; }
    setQ(text); setLoading(true); setError(''); setResult(null); setStreamingText('');
    try {
      // Stream the answer so the first words appear in ~1.4s instead of a ~3s
      // wall of silence. onToken fires with the full answer text as it grows.
      const res = await api.askStream(text, { onToken: setStreamingText });
      setResult(res);
    } catch (e: any) {
      // api.ts already extracted the server's `detail`, so e.message is the
      // human-readable text (e.g. the Pro-upsell for a gated Ask).
      const msg = e?.message || 'Something went wrong. Try again.';
      setError(msg);
    } finally {
      setLoading(false);
      setStreamingText('');
    }
  };

  if (locked) {
    const remaining = ASK_MIN_REELS - (savedCount ?? 0);
    return (
      <View style={styles.screen}>
        <View style={styles.lock}>
          <Label wide>Locked</Label>
          <Title style={styles.lockTitle}>Ask unlocks at {ASK_MIN_REELS} saves</Title>
          <Body style={styles.lockSub}>
            Ask answers questions from your own library — it needs a few saves to draw on.
            You have {savedCount}. Save {remaining} more to unlock it.
          </Body>
          {/* Segmented: "3 of 5" reads instantly; a part-filled grey bar doesn't. */}
          <View style={styles.lockTrack}>
            {Array.from({ length: ASK_MIN_REELS }).map((_, i) => (
              <View key={i} style={[styles.lockTick, i < (savedCount ?? 0) && styles.lockTickOn]} />
            ))}
          </View>
          <FilledButton label="Save a link" trailing="→" onPress={() => router.push('/save')} style={styles.lockCta} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* behavior="padding" on Android too — see the note in LoginScreen.tsx. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Title>Ask your library.</Title>
          <Body style={styles.sub}>
            Answers come only from what you've saved — never from the open web.
          </Body>

          {/* ── Out of AI actions ────────────────────────────────────────────
              Ask is the only screen where this is a hard stop: every question
              costs an action, so there is no degraded mode to fall back to.

              ⚠️ Search is offered here, NOT gated behind this state. It is
              free and always available (the library header and the menu both
              reach it); this block just makes it the obvious next move for
              someone who came to find something and cannot ask. Wording is
              careful about the difference: search finds a save, it does not
              answer a question, and pretending otherwise would be a worse
              consolation than saying so. */}
          {outOfAi && (
            <View style={styles.quotaBox}>
              <View style={styles.quotaHead}>
                <Icon name="time" size={15} color={colors.textSecondary} />
                <Label wide>No AI actions left today</Label>
              </View>
              <Body style={styles.quotaText}>
                Every question costs one, so Ask is paused. {resumesAtSentence(usage?.resets_at)}
                {' '}Meanwhile you can search your library by word — titles, tags, categories,
                summaries and your own notes. It finds the save; it won't answer the question.
              </Body>
              <FilledButton
                label="Search your library"
                trailing="→"
                onPress={() => router.push('/search')}
                style={styles.quotaCta}
              />
            </View>
          )}

          {/* ⚠️ THE FIELD IS GONE WHEN THERE IS NOTHING TO SPEND (owner,
              2026-08-15). It used to render under the out-of-AI notice: an
              inviting, focused, keyboard-raising text box whose only possible
              outcome was a 429 after you had typed a whole question. Telling
              someone a door is locked and leaving the handle turning is worse
              than not showing the handle. The screen's own autofocus effect is
              skipped for the same reason. */}
          {!outOfAi && (
          <View style={styles.field}>
            <View style={styles.fieldRow}>
              <TextInput
                ref={inputRef}
                style={styles.input}
                placeholder="e.g. what was that high-protein recipe?"
                placeholderTextColor={colors.textTertiary}
                value={q}
                onChangeText={t => { setQ(t); setError(''); }}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                /* ⚠️ `submitBehavior` IS REQUIRED ON A MULTILINE INPUT. React
                   Native's own docs: for multiline, `undefined` defaults to
                   'newline' — the return key inserts a line break and
                   `onSubmitEditing` NEVER FIRES. The handler above looked wired
                   and was dead, so the keyboard's Search key did nothing and
                   the send button was the only way through (owner, 2026-09-11).
                   Single-line inputs default to 'blurAndSubmit' and need none
                   of this, which is why the other four in the app are fine. */
                onSubmitEditing={() => ask(q)}
                submitBehavior="blurAndSubmit"
                returnKeyType="search"
                multiline
                editable={!loading}
              />
              <Pressable onPress={() => ask(q)} disabled={loading} style={styles.send} accessibilityLabel="Ask">
                {loading
                  ? <ActivityIndicator size="small" color={colors.textPrimary} />
                  : <Icon name="send" size={17} color={colors.textPrimary} />}
              </Pressable>
            </View>
            <View style={[styles.fieldRule, focused && styles.fieldRuleOn]} />
          </View>
          )}

          {/* Suggestions are hidden when the budget is gone — every one of them
              is a question that would 429. */}
          {!result && !loading && !error && !outOfAi && (
            <View style={styles.suggestions}>
              <Label wide style={styles.suggestHead}>Try</Label>
              <Rule />
              {SUGGESTIONS.map((s, i) => (
                <View key={s}>
                  <Pressable style={styles.suggestRow} onPress={() => ask(s)}>
                    <Index n={i + 1} style={styles.suggestIndex} />
                    <Body tone="primary" style={styles.suggestText}>{s}</Body>
                    <Icon name="arrow-forward" size={14} color={colors.textTertiary} />
                  </Pressable>
                  <Rule />
                </View>
              ))}
            </View>
          )}

          {error ? (
            <View style={styles.errorBox}>
              <Icon name="alert-circle" size={15} color={colors.textPrimary} />
              <Body tone="primary" style={styles.errorText}>{error}</Body>
            </View>
          ) : null}

          {/* Before the first token: a brief "searching" state. Once text starts
              streaming, show it live in the answer block with a caret. */}
          {loading && !streamingText && (
            <View style={styles.thinking}>
              <ActivityIndicator color={colors.textPrimary} size="small" />
              <Label>Searching your library…</Label>
            </View>
          )}

          {(loading && streamingText) || (result && !loading) ? (
            <View style={styles.answer}>
              <Label wide>Answer</Label>
              <Rule style={{ marginTop: spacing.sm }} />
              <Text style={styles.answerText}>
                {loading ? streamingText : result?.answer}
                {loading ? <Text style={styles.caret}>▍</Text> : null}
              </Text>
            </View>
          ) : null}

          {result && !loading && (
            <>
              <Disclaimer variant="ai" />

              {result.sources.length > 0 && (
                <View style={styles.sources}>
                  <Label wide style={styles.suggestHead}>From these saves</Label>
                  <Rule />
                  {result.sources.map((r, i) => (
                    <View key={r.id}>
                      <Pressable style={styles.sourceRow} onPress={() => router.push(`/reel/${r.id}`)}>
                        <Index n={i + 1} style={styles.suggestIndex} />
                        <View style={styles.sourceText}>
                          <Body tone="primary" style={styles.sourceTitle} numberOfLines={2}>
                            {r.title || 'Untitled'}
                          </Body>
                          <Label>{r.category || 'other'}</Label>
                        </View>
                        <Icon name="chevron-right" size={14} color={colors.textTertiary} />
                      </Pressable>
                      <Rule />
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: TAB_BAR_CLEARANCE + spacing.xl },
  sub: { marginTop: spacing.md, fontSize: font.sm, lineHeight: 20 },

  // ── Locked state ──
  lock: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.lg, gap: spacing.md },
  lockTitle: { marginTop: spacing.xs },
  lockSub: { fontSize: font.sm, lineHeight: 20 },
  lockTrack: { flexDirection: 'row', gap: 3, marginTop: spacing.sm },
  lockTick: { flex: 1, height: 4, backgroundColor: colors.ghostLine },
  lockTickOn: { backgroundColor: colors.textPrimary },
  lockCta: { marginTop: spacing.lg },

  field: { marginTop: spacing.xl },
  fieldRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  input: {
    flex: 1,
    color: colors.textPrimary,
    fontFamily: typeface.body,
    fontSize: font.lg,
    minHeight: 40,
    paddingVertical: spacing.sm,
    textAlignVertical: 'top',
  },
  send: { paddingBottom: spacing.sm, paddingLeft: spacing.sm },
  fieldRule: { height: 1, backgroundColor: colors.ghostLine },
  fieldRuleOn: { backgroundColor: colors.textPrimary },

  suggestions: { marginTop: spacing.xl },
  suggestHead: { marginBottom: spacing.sm },
  suggestRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  suggestIndex: { width: 22 },
  suggestText: { flex: 1, fontSize: font.sm },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.textPrimary,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  errorText: { flex: 1, fontSize: font.sm, lineHeight: 20 },

  quotaBox: {
    marginTop: spacing.xl,
    borderWidth: 1,
    borderColor: colors.ghostLine,
    padding: spacing.md,
    gap: spacing.sm,
  },
  quotaHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  quotaText: { fontSize: font.sm, lineHeight: 20 },
  quotaCta: { marginTop: spacing.xs },

  thinking: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },

  answer: { marginTop: spacing.xl },
  answerText: {
    color: colors.textPrimary,
    fontFamily: typeface.body,
    fontSize: font.md,
    lineHeight: 24,
    marginTop: spacing.md,
  },
  caret: { color: colors.textPrimary },

  sources: { marginTop: spacing.lg },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  sourceText: { flex: 1, minWidth: 0, gap: 2 },
  sourceTitle: { fontSize: font.sm },
}));
