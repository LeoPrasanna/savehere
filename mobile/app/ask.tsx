import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, ScrollView, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { api, AskResponse } from '../services/api';
import { Pressable } from '../components/Pressable';
import { Icon } from '../components/Icon';
import { Disclaimer } from '../components/Disclaimer';
import { ASK_MIN_REELS } from '../constants/limits';
import { colors, spacing, font, radius, gradients, categoryFor, themed } from '../constants/theme';

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
        <View style={styles.lockWrap}>
          <View style={styles.lockIcon}><Icon name="lock" size={30} color={colors.accent} /></View>
          <Text style={styles.lockTitle}>Ask unlocks at {ASK_MIN_REELS} saves</Text>
          <Text style={styles.lockSub}>
            Ask answers questions from your own library — it needs a few saves to draw on.
            You have {savedCount}. Save {remaining} more to unlock it.
          </Text>
          <View style={styles.lockTrack}>
            <View style={[styles.lockFill, { width: `${((savedCount ?? 0) / ASK_MIN_REELS) * 100}%` }]} />
          </View>
          <Pressable style={styles.lockBtnWrap} onPress={() => router.push('/save')} scaleTo={0.97}>
            <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.lockBtn}>
              <Icon name="add" size={18} color="#FFF" />
              <Text style={styles.lockBtnText}>Save a reel</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={styles.sub}>Ask anything about what you've saved — answers come only from your own library.</Text>

          <View style={styles.inputRow}>
            <Icon name="ask" size={18} color={colors.textSecondary} style={{ marginTop: 2 }} />
            <TextInput
              style={styles.input}
              placeholder="e.g. what was that high-protein recipe?"
              placeholderTextColor={colors.textSecondary}
              value={q}
              onChangeText={t => { setQ(t); setError(''); }}
              onSubmitEditing={() => ask(q)}
              returnKeyType="search"
              multiline
              editable={!loading}
            />
            <Pressable onPress={() => ask(q)} disabled={loading} scaleTo={0.9}>
              <LinearGradient colors={gradients.primary} style={styles.sendInner}>
                {loading ? <ActivityIndicator size="small" color="#FFF" /> : <Icon name="send" size={16} color="#FFF" />}
              </LinearGradient>
            </Pressable>
          </View>

          {!result && !loading && !error && (
            <View style={styles.suggestions}>
              {SUGGESTIONS.map(s => (
                <Pressable key={s} style={styles.chip} onPress={() => ask(s)}>
                  <Text style={styles.chipText}>{s}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {error ? (
            <View style={styles.errorBox}>
              <Icon name="alert-circle" size={16} color={colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Before the first token: a brief "searching" state. Once text starts
              streaming, show it live in the answer card with a caret. */}
          {loading && !streamingText && (
            <View style={styles.thinking}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.thinkingText}>Searching your library…</Text>
            </View>
          )}

          {loading && streamingText ? (
            <View style={styles.answerCard}>
              <View style={styles.answerHeader}>
                <Icon name="sparkles" size={15} color={colors.accent} />
                <Text style={styles.answerLabel}>Answer</Text>
              </View>
              <Text style={styles.answerText}>
                {streamingText}
                <Text style={styles.caret}>▍</Text>
              </Text>
            </View>
          ) : null}

          {result && !loading && (
            <>
              <View style={styles.answerCard}>
                <View style={styles.answerHeader}>
                  <Icon name="sparkles" size={15} color={colors.accent} />
                  <Text style={styles.answerLabel}>Answer</Text>
                </View>
                <Text style={styles.answerText}>{result.answer}</Text>
              </View>

              <Disclaimer variant="ai" />

              {result.sources.length > 0 && (
                <>
                  <Text style={styles.sourcesLabel}>FROM THESE SAVES</Text>
                  {result.sources.map(r => {
                    const cat = categoryFor(r.category);
                    return (
                      <Pressable key={r.id} style={styles.sourceRow} onPress={() => router.push(`/reel/${r.id}`)}>
                        <View style={[styles.sourceIcon, { backgroundColor: cat.color + '22' }]}>
                          <Icon name={cat.icon} size={14} color={cat.color} />
                        </View>
                        <Text style={styles.sourceTitle} numberOfLines={2}>{r.title || 'Untitled'}</Text>
                        <Icon name="chevron-right" size={16} color={colors.textTertiary} />
                      </Pressable>
                    );
                  })}
                </>
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
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  sub: { color: colors.textSecondary, fontSize: font.sm, lineHeight: 20 },

  // Locked state — shown when the library is below the Ask unlock threshold.
  lockWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  lockIcon: {
    width: 72, height: 72, borderRadius: radius.full,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs,
  },
  lockTitle: { color: colors.textPrimary, fontSize: font.lg, fontWeight: '800', textAlign: 'center' },
  lockSub: { color: colors.textSecondary, fontSize: font.sm, lineHeight: 20, textAlign: 'center' },
  lockTrack: {
    width: '80%', height: 6, borderRadius: radius.full, overflow: 'hidden',
    backgroundColor: colors.border, marginTop: spacing.sm,
  },
  lockFill: { height: '100%', borderRadius: radius.full, backgroundColor: colors.accent },
  lockBtnWrap: { marginTop: spacing.md, borderRadius: radius.md },
  lockBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 4,
  },
  lockBtnText: { color: '#FFF', fontSize: font.md, fontWeight: '800' },

  inputRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: spacing.sm + 2,
  },
  input: { flex: 1, color: colors.textPrimary, fontSize: font.md, minHeight: 36, textAlignVertical: 'top' },
  sendInner: { width: 40, height: 40, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },

  suggestions: { gap: spacing.sm },
  chip: {
    backgroundColor: colors.card, borderRadius: radius.full,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  chipText: { color: colors.textSecondary, fontSize: font.sm },

  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.danger + '1A', borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.danger, padding: spacing.md,
  },
  errorText: { flex: 1, color: colors.danger, fontSize: font.sm },

  thinking: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  thinkingText: { color: colors.textSecondary, fontSize: font.sm },

  answerCard: {
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm,
  },
  answerHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  answerLabel: { color: colors.textPrimary, fontSize: font.sm, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  answerText: { color: colors.textPrimary, fontSize: font.md, lineHeight: 23 },
  caret: { color: colors.accent, fontWeight: '800' },

  sourcesLabel: { color: colors.textSecondary, fontSize: font.xs, fontWeight: '800', letterSpacing: 1, marginTop: spacing.xs },
  sourceRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: spacing.sm + 2,
  },
  sourceIcon: { width: 30, height: 30, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  sourceTitle: { flex: 1, color: colors.textPrimary, fontSize: font.sm, fontWeight: '600' },
}));
