import { useState, useEffect } from 'react';
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
import { ASK_MIN_REELS } from '../constants/limits';
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
  // Save count gate: the entry points already hide Ask below the threshold, but a
  // deep link / back-navigation could still land here, so guard the screen too.
  // null = still checking (don't flash the locked state before we know).
  const [savedCount, setSavedCount] = useState<number | null>(null);

  useEffect(() => {
    api.getUsage().then(u => setSavedCount(u.saves.used)).catch(() => setSavedCount(null));
  }, []);
  const locked = savedCount !== null && savedCount < ASK_MIN_REELS;

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
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Title>Ask your library.</Title>
          <Body style={styles.sub}>
            Answers come only from what you've saved — never from the open web.
          </Body>

          {/* Underlined field with the send action inline. */}
          <View style={styles.field}>
            <View style={styles.fieldRow}>
              <TextInput
                style={styles.input}
                placeholder="e.g. what was that high-protein recipe?"
                placeholderTextColor={colors.textTertiary}
                value={q}
                onChangeText={t => { setQ(t); setError(''); }}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onSubmitEditing={() => ask(q)}
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

          {!result && !loading && !error && (
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
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
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
