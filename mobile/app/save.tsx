import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, StyleSheet, Animated, Easing,
  KeyboardAvoidingView, Platform, ScrollView, LayoutChangeEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import { Wand2, ClipboardPaste } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { Icon } from '../components/Icon';
import { api } from '../services/api';
import * as haptics from '../services/haptics';
import { Pressable } from '../components/Pressable';
import { GlassCard } from '../components/GlassCard';
import { colors, spacing, font, radius, gradients, shadow } from '../constants/theme';

const STEPS = [
  { icon: 'link', text: 'Checking the link…' },
  { icon: 'cloud-download', text: 'Fetching title & thumbnail…' },
  { icon: 'sparkles', text: 'Creating your card…' },
] as const;

const STEP_DELAYS = [0, 1500, 4000];
const N = STEPS.length;
const NODE = 30;
const BOT = 44;

const SAVE_NOTES = [
  'Public Reels, Shorts, TikToks & LinkedIn posts work best.',
  'Private or login-only content (and most Facebook reels) can\'t be read — you can still save the link and add your own notes.',
  'Summaries are AI-made, so a small detail might slip — easy to edit anytime.',
  'Your card appears in seconds — the AI summary finishes on its own right after.',
  'We save the link and an AI summary for your personal reference — the content stays its creator\'s.',
];

function parseError(e: any): string {
  try {
    const parsed = JSON.parse(e.message);
    const detail = parsed?.detail ?? e.message;
    if (detail.includes('timed out')) return 'Took too long to fetch. YouTube may be slow right now — try again.';
    if (detail.includes('minutes long')) return detail;
    if (detail.includes('Could not extract')) return 'Could not read this URL. Check it\'s a public Reel, Short, or TikTok and try again.';
    if (detail.includes('login') || detail.includes('private')) return 'This content is private or requires login. SaveHere can only save public content.';
    return detail;
  } catch {
    if (e.message?.includes('timed out') || e.name === 'AbortError')
      return 'Request timed out. The server is taking too long — restart the backend and try again.';
    if (e.message?.includes('fetch') || e.message?.includes('Network'))
      return 'Can\'t reach the server. Make sure the backend is running on port 8000.';
    return e.message || 'Something went wrong. Try again.';
  }
}

export default function SaveScreen() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [trackW, setTrackW] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

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

  const botX = useRef(new Animated.Value(0)).current;
  const botJump = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;
  const squash = useRef(new Animated.Value(1)).current;
  const fillW = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  const nodeCenter = (i: number) => NODE / 2 + (trackW > 0 ? i * (trackW - NODE) / (N - 1) : 0);
  const botLeftFor = (i: number) => nodeCenter(i) - BOT / 2;
  const fillFor = (i: number) => Math.max(0, nodeCenter(i) - NODE / 2);

  useEffect(() => {
    if (trackW > 0) {
      botX.setValue(botLeftFor(stepIdx));
      fillW.setValue(fillFor(stepIdx));
    }
  }, [trackW]);

  useEffect(() => {
    if (!loading) return;
    const hover = Animated.loop(Animated.sequence([
      Animated.timing(bob, { toValue: -5, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(bob, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    const blink = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.45, duration: 600, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]));
    hover.start(); blink.start();
    return () => { hover.stop(); blink.stop(); };
  }, [loading]);

  useEffect(() => {
    if (!loading || trackW === 0) return;
    Animated.parallel([
      Animated.timing(botX, { toValue: botLeftFor(stepIdx), duration: 620, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      Animated.timing(fillW, { toValue: fillFor(stepIdx), duration: 620, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
      Animated.sequence([
        Animated.timing(botJump, { toValue: -38, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(botJump, { toValue: 0, friction: 4, tension: 90, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(squash, { toValue: 1.12, duration: 150, useNativeDriver: true }),
        Animated.timing(squash, { toValue: 0.82, duration: 200, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.spring(squash, { toValue: 1, friction: 4, useNativeDriver: true }),
      ]),
    ]).start();
  }, [stepIdx, loading, trackW]);

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
      const reel = await api.saveReel(trimmed);
      clearStepTimers();
      haptics.success();
      // A short success beat completes the robot's journey before the card
      // opens — feedback first, then navigation.
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

  const onTrackLayout = (e: LayoutChangeEvent) => setTrackW(e.nativeEvent.layout.width);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <MotiView
          from={{ opacity: 0, scale: 0.9, translateY: 8 }}
          animate={{ opacity: 1, scale: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 300 }}
          style={styles.heroIcon}
        >
          <LinearGradient colors={gradients.primary} style={styles.heroIconInner}>
            <Wand2 size={24} color="#FFF" />
          </LinearGradient>
        </MotiView>

        <MotiView from={{ opacity: 0, translateY: 10 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'spring', damping: 15, delay: 90 }}>
          <Text style={styles.label}>Paste a link to save</Text>
          <Text style={styles.hint}>YouTube Shorts · Instagram Reels · TikTok · LinkedIn</Text>
        </MotiView>

        <MotiView from={{ opacity: 0, translateY: 8 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 300, delay: 120 }}>
          <View style={[styles.inputWrap, loading && styles.inputDisabled]}>
            <Icon name="link" size={18} color={colors.textTertiary} style={{ marginTop: 2 }} />
            <TextInput
              style={styles.input}
              placeholder="Paste any reel, short or post link…"
              placeholderTextColor={colors.textTertiary}
              value={url}
              onChangeText={t => { setUrl(t); setError(''); }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              multiline
              editable={!loading}
            />
          </View>
        </MotiView>

        {/* One-tap paste — reads the clipboard on demand, no permission surprises */}
        {!loading && !url && (
          <MotiView from={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 220, duration: 300 }}>
            <Pressable style={styles.pasteChip} onPress={pasteFromClipboard} scaleTo={0.97}>
              <ClipboardPaste size={15} color={colors.accentLight} />
              <Text style={styles.pasteChipText}>Paste copied link</Text>
            </Pressable>
          </MotiView>
        )}

        {error ? (
          <View style={styles.errorBox}>
            <Icon name="alert-circle" size={18} color={colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {!loading && (
          <MotiView
            from={{ opacity: 0, scale: 0.96, translateY: 12 }}
            animate={{ opacity: 1, scale: 1, translateY: 0 }}
            transition={{ type: 'spring', damping: 15, delay: 240 }}
          >
            <GlassCard tint="none" intensity="low" style={styles.notesCard}>
              <View style={styles.notesHeader}>
                <Icon name="information-circle" size={15} color={colors.accentLight} />
                <Text style={styles.notesTitle}>Good to know</Text>
              </View>
              {SAVE_NOTES.map((n, i) => (
                <View key={i} style={styles.noteRow}>
                  <Icon name="checkmark" size={12} color={colors.accentLight} style={{ marginTop: 2 }} />
                  <Text style={styles.noteText}>{n}</Text>
                </View>
              ))}
            </GlassCard>
          </MotiView>
        )}

        {/* Bot progress track */}
        {loading && (
          <View style={styles.progressCard}>
            <View style={styles.track} onLayout={onTrackLayout}>
              <View style={styles.botLayer}>
                <Animated.View style={[
                  styles.bot,
                  {
                    opacity: trackW > 0 ? 1 : 0,
                    transform: [
                      { translateX: botX },
                      { translateY: Animated.add(botJump, bob) },
                      { scaleY: squash },
                    ],
                  },
                ]}>
                  <Text style={styles.botEmoji}>🤖</Text>
                </Animated.View>
              </View>

              <View style={styles.rail}>
                <View style={styles.railLine} />
                <Animated.View style={[styles.railFill, { width: fillW }]} />
                <View style={styles.nodeRow}>
                  {STEPS.map((step, i) => {
                    const done = i < stepIdx || success;
                    const active = i === stepIdx && !success;
                    return (
                      <View key={i} style={[styles.node, done && styles.nodeDone, active && styles.nodeActive]}>
                        {done
                          ? <Icon name="checkmark" size={15} color="#FFF" />
                          : <Icon name={step.icon as any} size={13} color={active ? colors.accent : colors.textTertiary} />}
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>

            <Animated.Text style={[styles.stepLabel, success && { color: colors.success }, { opacity: success ? 1 : pulse }]}>
              {success ? 'Saved! Opening your card…' : STEPS[stepIdx].text}
            </Animated.Text>
            {!success && <Text style={styles.stepCount}>Step {stepIdx + 1} of {N}</Text>}
          </View>
        )}

        <Pressable onPress={handleSave} disabled={loading} style={styles.buttonWrap} scaleTo={0.97}>
          <LinearGradient
            colors={loading ? [colors.cardElevated, colors.card] : gradients.hologram}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.button}
          >
            {loading ? (
              <Text style={styles.buttonText}>{success ? 'Saved ✓' : `Working… ${stepIdx + 1}/${N}`}</Text>
            ) : (
              <>
                <Icon name="sparkles" size={18} color="#FFF" />
                <Text style={styles.buttonText}>Save & Summarize</Text>
              </>
            )}
          </LinearGradient>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  inner: { flexGrow: 1, padding: spacing.lg, justifyContent: 'center', gap: spacing.md },

  heroIcon: { alignItems: 'center', marginBottom: spacing.xs },
  heroIconInner: {
    width: 64, height: 64, borderRadius: radius.lg,
    alignItems: 'center', justifyContent: 'center',
    ...shadow.glow,
  },

  label: { color: colors.textPrimary, fontSize: font.xl, fontWeight: '800', textAlign: 'center' },
  hint: { color: colors.textSecondary, fontSize: font.sm, textAlign: 'center', marginTop: spacing.xs },

  inputWrap: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md, minHeight: 80,
  },
  inputDisabled: { opacity: 0.5 },
  input: { flex: 1, color: colors.textPrimary, fontSize: font.md, textAlignVertical: 'top', minHeight: 50 },

  pasteChip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    alignSelf: 'center',
    backgroundColor: colors.accent + '14',
    borderWidth: 1, borderColor: colors.accent + '33',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  pasteChipText: { color: colors.accentLight, fontSize: font.sm, fontWeight: '600' },

  errorBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    backgroundColor: colors.danger + '1A',
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.danger, padding: spacing.md,
  },
  errorText: { flex: 1, color: colors.danger, fontSize: font.sm, lineHeight: 20 },

  notesCard: {
    padding: spacing.md, gap: spacing.sm,
  },
  notesHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  notesTitle: { color: colors.textSecondary, fontSize: font.xs, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  noteText: { flex: 1, color: colors.textSecondary, fontSize: font.xs, lineHeight: 17 },

  progressCard: {
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, gap: spacing.sm, alignItems: 'center',
  },
  track: { width: '100%', height: BOT + NODE + 8 },
  botLayer: { height: BOT, width: '100%' },
  bot: { position: 'absolute', left: 0, top: 0, width: BOT, height: BOT, alignItems: 'center', justifyContent: 'flex-end' },
  botEmoji: { fontSize: 30, ...Platform.select({ ios: { textShadowColor: colors.accent, textShadowRadius: 10 }, default: {} }) },

  rail: { height: NODE + 8, justifyContent: 'center' },
  railLine: {
    position: 'absolute', left: NODE / 2, right: NODE / 2, height: 3,
    backgroundColor: colors.border, borderRadius: radius.full,
  },
  railFill: {
    position: 'absolute', left: NODE / 2, height: 3,
    backgroundColor: colors.accent, borderRadius: radius.full,
  },
  nodeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  node: {
    width: NODE, height: NODE, borderRadius: NODE / 2,
    backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  nodeActive: { borderColor: colors.accent, backgroundColor: colors.cardElevated },
  nodeDone: { backgroundColor: colors.accent, borderColor: colors.accent },

  stepLabel: { color: colors.textPrimary, fontSize: font.md, fontWeight: '700', textAlign: 'center', marginTop: spacing.xs },
  stepCount: { color: colors.textSecondary, fontSize: font.xs, fontWeight: '600' },

  buttonWrap: { borderRadius: radius.md, ...shadow.md },
  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    borderRadius: radius.md, padding: spacing.md, minHeight: 54,
  },
  buttonText: { color: '#FFF', fontSize: font.md, fontWeight: '800' },
});
