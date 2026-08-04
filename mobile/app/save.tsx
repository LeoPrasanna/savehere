import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, StyleSheet, Animated,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { Icon } from '../components/Icon';
import { api } from '../services/api';
import { fetchClientMetadata } from '../services/clientExtract';
import * as haptics from '../services/haptics';
import { Pressable } from '../components/Pressable';
import { Label, Body, Title, Rule, Index, GhostButton, FilledButton } from '../components/kit';
import { colors, spacing, font, tracking, typeface, motion, themed } from '../constants/theme';

const STEPS = [
  { text: 'Checking the link' },
  { text: 'Saving your card' },
  { text: 'Handing off to the AI' },
] as const;

// Saves return in well under a second now (extraction runs in the background),
// so the arc is quick — the steps still get their moment without faking work.
const STEP_DELAYS = [0, 350, 800];
const N = STEPS.length;

const SAVE_NOTES = [
  'Public Reels, YouTube Shorts, TikToks & LinkedIn posts work best.',
  'Your card saves instantly — the title, thumbnail and AI summary fill in on their own right after.',
  "Private or login-only content (and most Facebook reels) can't be read — paste the post text into Notes and tap Re-summarize instead.",
  'Cooking and workout saves can become step-by-step recipes and guided plans.',
  'Everything is auto-categorized and searchable, so you can find any save in seconds.',
  'Summaries, recipes, workouts and questions share a daily AI limit that resets each day.',
  'Summaries are AI-made, so a small detail might slip — easy to edit anytime.',
  "We save the link and an AI summary for your personal reference — the content stays its creator's.",
];

function parseError(e: any): string {
  // api.ts already extracts FastAPI's `detail`, so e.message is the plain
  // human-readable string (was previously JSON here — the old JSON.parse made
  // this whole remap dead code, falling through to the raw detail).
  const detail: string = e?.message || '';
  if (e?.name === 'AbortError' || detail.includes('timed out'))
    return 'Request timed out. The server is taking too long — try again.';
  if (detail.includes('minutes long')) return detail;
  if (detail.includes('Could not extract')) return "Could not read this URL. Check it's a public Reel, Short, or TikTok and try again.";
  if (detail.includes('login') || detail.includes('private')) return 'This content is private or requires login. SaveHere can only save public content.';
  if (detail.includes('fetch') || detail.includes('Network'))
    return "Can't reach the server. Make sure the backend is running on port 8000.";
  return detail || 'Something went wrong. Try again.';
}

export default function SaveScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [focused, setFocused] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pulse = useRef(new Animated.Value(1)).current;

  // Reads the clipboard only on tap (a user gesture), so no permission prompt
  // fires on open — works the same on iOS and web.
  const pasteFromClipboard = async () => {
    try {
      const text = (await Clipboard.getStringAsync())?.trim();
      if (text && /^https?:\/\/\S+$/i.test(text)) {
        setUrl(text);
        setError('');
        haptics.tap();
      } else {
        setError("No link on the clipboard — copy a reel's URL first, then tap Paste.");
      }
    } catch {
      setError("Couldn't read the clipboard. Paste the link into the box manually.");
    }
  };

  // The one running animation on this screen: the active step's label breathes.
  // Opacity only — this direction's motion rule allows colour and opacity, and
  // nothing else. (The bouncing robot that used to live here was the single most
  // off-system element in the app.)
  useEffect(() => {
    if (!loading) return;
    const blink = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.4, duration: 600, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]));
    blink.start();
    return () => { blink.stop(); };
  }, [loading]);

  const startStepTimers = () => {
    setStepIdx(0);
    STEP_DELAYS.forEach((delay, i) => {
      if (i === 0) return;
      timers.current.push(setTimeout(() => setStepIdx(i), delay));
    });
  };
  const clearStepTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  const handleSave = async () => {
    const trimmed = url.trim();
    if (!trimmed) { setError('Paste a URL first.'); return; }
    setLoading(true); setError(''); startStepTimers();
    try {
      // Kick the device-side metadata fetch off FIRST but don't await it here —
      // it runs alongside the save so the card still appears immediately. It only
      // matters for links our server's datacenter IP can't read (Instagram/
      // Facebook); the server discards it whenever its own extraction worked.
      const metaPromise = fetchClientMetadata(trimmed);

      const reel = await api.saveReel(trimmed);

      // Fire-and-forget: deliver the metadata once it lands. Failures are silent
      // by design — the save already succeeded and the server has its own path.
      metaPromise
        .then((meta) => (meta ? api.sendClientMetadata(reel.id, meta) : null))
        .catch(() => {});

      clearStepTimers();
      haptics.success();
      // A short success beat completes the sequence before the card opens —
      // feedback first, then navigation.
      setStepIdx(N - 1);
      setSuccess(true);
      setTimeout(() => router.replace(`/reel/${reel.id}`), 650);
    } catch (e: any) {
      clearStepTimers();
      haptics.error();
      setError(parseError(e));
      setLoading(false);
      setStepIdx(0);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Label wide>New save</Label>
        <Title style={styles.title}>Paste a link.</Title>
        <Label style={styles.hint}>YouTube Shorts · Instagram Reels · TikTok · LinkedIn</Label>

        {/* Underlined field — the system defines inputs with the same 1px seam
            it uses for every other boundary. */}
        <View style={[styles.field, loading && styles.fieldOff]}>
          <TextInput
            style={styles.input}
            placeholder="https://…"
            placeholderTextColor={colors.textTertiary}
            value={url}
            onChangeText={t => { setUrl(t); setError(''); }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            multiline
            editable={!loading}
          />
          <View style={[styles.fieldRule, focused && styles.fieldRuleOn]} />
        </View>

        {/* One-tap paste — reads the clipboard on demand, no permission surprises */}
        {!loading && !url && (
          <Pressable style={styles.paste} onPress={pasteFromClipboard}>
            <Icon name="copy" size={14} color={colors.textSecondary} />
            <Label tone="ink" wide>Paste copied link</Label>
          </Pressable>
        )}

        {error ? (
          <View style={styles.errorBox}>
            <Icon name="alert-circle" size={15} color={colors.textPrimary} />
            <Body tone="primary" style={styles.errorText}>{error}</Body>
          </View>
        ) : null}

        {/* Progress — numbered rows, the same archival grammar as the rest of
            the app. A row is done, running, or waiting; the state is a word and
            a mark, never a colour. */}
        {loading && (
          <View style={styles.progress}>
            <Rule />
            {STEPS.map((step, i) => {
              const done = i < stepIdx || success;
              const active = i === stepIdx && !success;
              return (
                <View key={i}>
                  <View style={styles.stepRow}>
                    <Index n={i + 1} style={styles.stepIndex} />
                    <Animated.Text
                      style={[
                        styles.stepText,
                        (done || active) && styles.stepTextOn,
                        active && { opacity: pulse },
                      ]}
                    >
                      {step.text}
                    </Animated.Text>
                    {done
                      ? <Icon name="checkmark" size={14} color={colors.textPrimary} />
                      : <View style={[styles.stepMark, active && styles.stepMarkOn]} />}
                  </View>
                  <Rule />
                </View>
              );
            })}
            <Label style={styles.stepCount}>
              {success ? 'Saved — opening your card' : `Step ${stepIdx + 1} of ${N}`}
            </Label>
          </View>
        )}

        {!loading && (
          <View style={styles.notes}>
            <Label wide style={styles.notesTitle}>Good to know</Label>
            <Rule />
            {SAVE_NOTES.map((n, i) => (
              <View key={i}>
                <View style={styles.noteRow}>
                  <Index n={i + 1} style={styles.noteIndex} />
                  <Body style={styles.noteText}>{n}</Body>
                </View>
                <Rule />
              </View>
            ))}
          </View>
        )}

      </ScrollView>

      {/* ⚠️ PINNED, NOT AT THE END OF THE SCROLL.
          "Good to know" is eight paragraphs long, and with the button after it
          the primary action of the screen sat below the fold on a phone — you
          had to scroll past the small print to save anything. The notes scroll;
          the button does not move. */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {loading ? (
          <GhostButton
            label={success ? 'Saved' : `Working  ${stepIdx + 1}/${N}`}
            disabled
          />
        ) : (
          <FilledButton
            label="Save & summarize"
            trailing="→"
            onPress={handleSave}
          />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = themed(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  inner: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.lg },

  title: { marginTop: spacing.sm },
  hint: { marginTop: spacing.sm },

  field: { marginTop: spacing.xl },
  fieldOff: { opacity: 0.4 },
  input: {
    color: colors.textPrimary,
    fontFamily: typeface.body,
    fontSize: font.lg,
    paddingVertical: spacing.sm,
    minHeight: 56,
    textAlignVertical: 'top',
  },
  fieldRule: { height: 1, backgroundColor: colors.ghostLine },
  fieldRuleOn: { backgroundColor: colors.textPrimary },

  paste: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    paddingVertical: spacing.md,
  },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.textPrimary,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  errorText: { flex: 1, fontSize: font.sm, lineHeight: 20 },

  progress: { marginTop: spacing.xl },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  stepIndex: { width: 22 },
  stepText: {
    flex: 1,
    color: colors.textTertiary,
    fontFamily: typeface.body,
    fontSize: font.md,
  },
  stepTextOn: { color: colors.textPrimary },
  stepMark: { width: 8, height: 8, borderWidth: 1, borderColor: colors.ghostLine },
  stepMarkOn: { borderColor: colors.textPrimary },
  stepCount: { marginTop: spacing.md },

  notes: { marginTop: spacing.xl },
  notesTitle: { marginBottom: spacing.sm },
  noteRow: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md },
  noteIndex: { width: 22, paddingTop: 3 },
  noteText: { flex: 1, fontSize: font.sm, lineHeight: 19 },

  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.ghostLine,
  },
}));
