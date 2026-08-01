import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, TextInputProps, Animated, Image,
  Easing, AccessibilityInfo,
} from 'react-native';
import type { ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './Icon';
import { Pressable } from './Pressable';
import { supabase } from '../services/supabase';
import { thumbUrl } from '../services/api';
import { getThumbs, hydrateThumbs } from '../services/thumbCache';
import { useAuth } from '../contexts/AuthContext';
import * as haptics from '../services/haptics';
import { Label, Body, Wordmark, GhostButton, FilledButton, Rule, Index } from './kit';
import { colors, spacing, font, tracking, typeface, themed } from '../constants/theme';

type Mode = 'signin' | 'signup';
type Step = 'welcome' | 'form';

// Client-side password gate for signup. This is UX only — it can't be trusted
// (anyone can call the Supabase API directly), so the REAL floor is the
// Supabase dashboard password policy + leaked-password protection (owner
// action, see TODO). Length-first per NIST 800-63B: we require length and
// merely ENCOURAGE variety rather than forcing composition rules.
const MIN_PASSWORD = 8;

function passwordStrength(pw: string): { level: 0 | 1 | 2 | 3; label: string; ok: boolean } {
  if (pw.length < MIN_PASSWORD) {
    return { level: 0, label: `Use at least ${MIN_PASSWORD} characters`, ok: false };
  }
  const variety =
    (/[a-z]/.test(pw) ? 1 : 0) + (/[A-Z]/.test(pw) ? 1 : 0) +
    (/[0-9]/.test(pw) ? 1 : 0) + (/[^A-Za-z0-9]/.test(pw) ? 1 : 0);
  if (pw.length >= 12 && variety >= 3) return { level: 3, label: 'Strong password', ok: true };
  if (pw.length >= 10 || variety >= 3) return { level: 2, label: 'Good — longer is stronger', ok: true };
  return { level: 1, label: 'OK — add length or a number/symbol to strengthen', ok: true };
}

// Surface Supabase's auth errors as short, human messages.
function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login')) return 'Wrong email or password.';
  if (m.includes('already registered')) return 'That email already has an account — sign in instead.';
  if (m.includes('password should be') || m.includes('password is too weak')) return `Password must be at least ${MIN_PASSWORD} characters.`;
  if (m.includes('unable to validate email') || m.includes('invalid email')) return 'Enter a valid email address.';
  if (m.includes('network')) return "Couldn't reach the server. Check your connection.";
  return message || 'Something went wrong. Try again.';
}

/* ── Welcome backdrop ─────────────────────────────────────────────────────── */

const COLS = 3;
/** Tiles per column before the strip repeats. */
const PER_COL = 5;
/** Portrait, because reels are. Fixed so the loop distance is known without
 *  measuring anything on screen. */
const TILE_H = 196;
/** Seconds for one column to travel its own length. Slow on purpose — this is
 *  atmosphere behind a sign-in form, not a carousel asking to be watched. */
const DRIFT_S = 34;

/**
 * One drifting column. Renders its tiles TWICE and translates by exactly one
 * copy's height, so the wrap is seamless — at the moment it resets, the pixels
 * on screen are identical.
 *
 * `dir` alternates per column (owner direction, 2026-08-01): odd columns fall,
 * even columns rise. Opposing motion is what stops a tilted grid reading as one
 * sliding sheet, and it's the move that makes the whole thing feel alive.
 */
function DriftColumn({ uris, dir, seconds }: { uris: (string | null)[]; dir: 1 | -1; seconds: number }) {
  const y = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    // Respect the OS "reduce motion" switch. Continuous background movement
    // with no way to stop it is exactly what that setting exists for, and a
    // sign-in screen is not somewhere to overrule it.
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(on => { if (!cancelled) setReduceMotion(on); })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { cancelled = true; sub?.remove?.(); };
  }, []);

  const span = uris.length * TILE_H;

  useEffect(() => {
    if (reduceMotion || span === 0) { y.setValue(0); return; }
    // Two copies are stacked, so travelling exactly one copy's height lands on
    // pixels identical to the start — the wrap is invisible.
    //   dir  1: 0 → -span   content rises
    //   dir -1: -span → 0   content falls
    // Animated.loop resets to the starting value each iteration by default,
    // which is what makes the reset seamless rather than a jump.
    const from = dir === 1 ? 0 : -span;
    const to = dir === 1 ? -span : 0;
    y.setValue(from);
    const loop = Animated.loop(
      Animated.timing(y, {
        toValue: to,
        duration: seconds * 1000,
        easing: Easing.linear,   // the one place linear is correct: a seam is
        useNativeDriver: true,   // only invisible at constant velocity
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, span, dir, seconds]);

  return (
    <View style={styles.driftCol}>
      <Animated.View style={{ transform: [{ translateY: y }] }}>
        {[...uris, ...uris].map((uri, i) => (
          <View key={i} style={styles.frame}>
            {uri ? (
              <Image source={{ uri: thumbUrl(uri) }} style={styles.frameImg} resizeMode="cover" />
            ) : (
              <Index n={(i % uris.length) + 1} tone="veil" style={styles.frameIndex} />
            )}
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

/**
 * The backdrop: a DRIFTING COLLAGE OF THE USER'S OWN SAVES.
 *
 * The reference welcome screen is image-led — a tilted, darkened mosaic of real
 * content. These are the user's most recent thumbnails, cached from their last
 * session (see services/thumbCache.ts for why their own saves rather than stock
 * photography). The whole grid is oversized and rotated so the crop reads as a
 * fragment of something larger, exactly as the reference does; the columns then
 * drift in alternating directions.
 *
 * On a first-ever launch there is nothing cached, and the fallback is what the
 * library actually is at that moment: a sheet of numbered empty frames, drifting
 * the same way.
 *
 * ponytail: animated in code rather than as a GIF/video asset. A GIF would be a
 * fixed-size, block-compressed file showing somebody else's content, and it
 * would ship in every bundle forever. This weighs nothing, stays sharp at any
 * density, and shows the user their own library.
 *
 * ponytail: no blur. The reference blurs its collage, which on native needs
 * `expo-blur` — a native module, on a project that has no dev build yet
 * (TODO.md). The tilt plus a heavy scrim carries the same "atmosphere, not
 * content" read. Add expo-blur when a native build exists and it's worth it.
 */
function ContactSheetBackdrop({ thumbs }: { thumbs: string[] }) {
  // Deal the thumbnails out column by column, cycling if there aren't enough,
  // so a user with three saves still gets a full mosaic rather than a gap.
  const columns = Array.from({ length: COLS }, (_, c) =>
    Array.from({ length: PER_COL }, (_, r) => {
      if (thumbs.length === 0) return null;
      return thumbs[(c * PER_COL + r) % thumbs.length];
    }),
  );

  return (
    <View style={[styles.backdropClip, { pointerEvents: 'none' }]}>
      <View style={styles.backdrop}>
        {columns.map((uris, c) => (
          <DriftColumn
            key={c}
            uris={uris}
            // Alternating: odd columns rise, even columns fall. Opposing motion
            // is what stops a tilted grid reading as one sliding sheet.
            dir={c % 2 === 0 ? 1 : -1}
            // Slightly different speeds so the columns never re-align into a
            // visible rhythm. Prime-ish offsets rather than round numbers.
            seconds={DRIFT_S + c * 7}
          />
        ))}
      </View>
    </View>
  );
}

/** An underlined field — a rule, not a box. The system has no card chrome, so
 *  an input is defined by the same 1px seam as everything else. */
type FieldProps = TextInputProps & { label: string; trailing?: ReactNode };

function Field({ label, trailing, ...rest }: FieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Label>{label}</Label>
      <View style={styles.fieldRow}>
        <TextInput
          style={styles.input}
          placeholderTextColor={colors.textTertiary}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...rest}
        />
        {trailing}
      </View>
      <View style={[styles.fieldRule, focused && styles.fieldRuleOn]} />
    </View>
  );
}

export function LoginScreen() {
  const { triggerCelebrate } = useAuth();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('welcome');
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showPw, setShowPw] = useState(false);
  // Web reads the cache synchronously at module init, so the first paint is
  // already correct; native has to hydrate from AsyncStorage after mount.
  const [thumbs, setThumbs] = useState<string[]>(getThumbs);
  useEffect(() => { hydrateThumbs().then(setThumbs); }, []);

  const isSignup = mode === 'signup';
  const shakeX = useRef(new Animated.Value(0)).current;

  // A quick left-right shake — the universal "that didn't work" cue. Kept
  // despite the direction's minimal-motion rule: this is error feedback, not
  // decoration, and it is the one place movement carries information.
  const shake = () => {
    shakeX.setValue(0);
    Animated.sequence(
      [-10, 9, -7, 6, -3, 0].map((to) =>
        Animated.timing(shakeX, { toValue: to, duration: 45, useNativeDriver: true }),
      ),
    ).start();
  };

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    haptics.tap();
    setMode(m);
    setError('');
    setNotice('');
  };

  const fail = (msg: string) => {
    haptics.error();
    setError(msg);
    shake();
  };

  const pwStrength = passwordStrength(password);

  const submit = async () => {
    const e = email.trim();
    if (!e || !password) { fail('Enter your email and password.'); return; }
    if (mode === 'signup' && !firstName.trim()) { fail('Enter your first name.'); return; }
    if (mode === 'signup' && !pwStrength.ok) { fail(`Use at least ${MIN_PASSWORD} characters for your password.`); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: e, password });
        if (error) throw error;
        haptics.success();
        triggerCelebrate();
        // On success, AuthProvider's listener flips the gate to the app — no nav here.
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: e,
          password,
          options: {
            data: {
              first_name: firstName.trim(),
              last_name: lastName.trim() || undefined,
              nickname: nickname.trim() || undefined,
            },
          },
        });
        if (error) throw error;
        if (data.session) {
          // Email confirmation is OFF — they're signed in immediately.
          haptics.success();
          triggerCelebrate();
        } else {
          // Confirmation ON — no session yet; tell them to verify.
          haptics.success();
          setNotice('Check your email to confirm your account, then sign in.');
          setMode('signin');
        }
      }
    } catch (err: any) {
      fail(friendly(err?.message || ''));
    } finally {
      setBusy(false);
    }
  };

  /* ── Step 1: welcome ─────────────────────────────────────────────────────── */
  if (step === 'welcome') {
    return (
      <View style={styles.container}>
        <ContactSheetBackdrop thumbs={thumbs} />
        <View style={[styles.scrim, { pointerEvents: 'none' }]} />
        <View style={[styles.welcome, { paddingTop: insets.top, paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.welcomeMid}>
            <Wordmark size={52} />
            <Label wide style={styles.welcomeSub}>Everything you saved · actually findable</Label>
          </View>

          {/*
            One entry point, laid out as a ROW so Apple and Google drop in
            beside it without a redesign. They are deliberately absent rather
            than present-and-dead: neither provider is wired up yet (both are
            open blockers in TODO.md), and a button that does nothing is worse
            than a button that isn't there.
          */}
          <View style={styles.authRow}>
            <Pressable
              style={styles.authBtn}
              onPress={() => { haptics.tap(); setStep('form'); }}
              accessibilityRole="button"
              accessibilityLabel="Continue with email"
            >
              <Icon name="mail" size={22} color={colors.textPrimary} />
            </Pressable>
          </View>
          <Label style={styles.authHint}>Continue with email</Label>

          <Text style={styles.legal}>
            By continuing you agree to our <Text style={styles.legalStrong}>Terms</Text> and{' '}
            <Text style={styles.legalStrong}>Privacy Policy</Text>. SaveHere stores links and
            AI-generated summaries for personal reference; saved content belongs to its original
            creators, and AI summaries may be imperfect.
          </Text>
        </View>
      </View>
    );
  }

  /* ── Step 2: the form ────────────────────────────────────────────────────── */
  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.formInner, { paddingTop: insets.top + spacing.md }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          onPress={() => { haptics.tap(); setStep('welcome'); setError(''); }}
          hitSlop={12}
          style={styles.back}
        >
          <Icon name="back" size={20} color={colors.textPrimary} />
        </Pressable>

        <Wordmark size={34} style={styles.formWordmark} />

        {/* Mode switch — two tracked labels and a rule, not a segmented pill.
            The active one is ink, the other ash. Hierarchy without a fill. */}
        <View style={styles.modes}>
          <Pressable onPress={() => switchMode('signin')} hitSlop={8}>
            <Label tone={!isSignup ? 'ink' : 'muted'} wide>Sign in</Label>
          </Pressable>
          <View style={styles.modeDiv} />
          <Pressable onPress={() => switchMode('signup')} hitSlop={8}>
            <Label tone={isSignup ? 'ink' : 'muted'} wide>Create account</Label>
          </Pressable>
        </View>
        <Rule />

        <Animated.View style={[styles.fields, { transform: [{ translateX: shakeX }] }]}>
          {isSignup && (
            <>
              <Field
                label="First name" value={firstName} onChangeText={setFirstName}
                placeholder="Required" autoCapitalize="words" editable={!busy}
                accessibilityLabel="First name"
              />
              <Field
                label="Last name" value={lastName} onChangeText={setLastName}
                placeholder="Optional" autoCapitalize="words" editable={!busy}
                accessibilityLabel="Last name, optional"
              />
              <Field
                label="Nickname" value={nickname} onChangeText={setNickname}
                placeholder="What we'll call you" autoCapitalize="words" editable={!busy}
                accessibilityLabel="Nickname, optional"
              />
            </>
          )}

          <Field
            label="Email" value={email} onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none" autoCorrect={false}
            keyboardType="email-address" inputMode="email" editable={!busy}
            accessibilityLabel="Email"
          />
          <Field
            label="Password" value={password} onChangeText={setPassword}
            placeholder={isSignup ? `${MIN_PASSWORD}+ characters` : 'Your password'}
            secureTextEntry={!showPw} autoCapitalize="none" editable={!busy}
            onSubmitEditing={submit} returnKeyType="go"
            accessibilityLabel="Password"
            trailing={
              <Pressable hitSlop={10} onPress={() => { haptics.tap(); setShowPw((s) => !s); }}>
                <Icon name={showPw ? 'eye-off' : 'eye'} size={17} color={colors.textTertiary} />
              </Pressable>
            }
          />

          {/* Strength meter. With no colour available, the three segments read
              by FILL COUNT and the words say the rest — which was always the
              accessible way to do this anyway. */}
          {isSignup && password.length > 0 && (
            <View style={styles.strengthWrap} accessibilityLabel={`Password strength: ${pwStrength.label}`}>
              <View style={styles.strengthTrack}>
                {[0, 1, 2].map((i) => (
                  <View key={i} style={[styles.strengthSeg, i < pwStrength.level && styles.strengthSegOn]} />
                ))}
              </View>
              <Label>{pwStrength.label}</Label>
            </View>
          )}
        </Animated.View>

        {error ? (
          <View style={styles.msgRow}>
            <Icon name="alert-circle" size={14} color={colors.textPrimary} />
            <Text style={styles.msgText}>{error}</Text>
          </View>
        ) : null}
        {notice ? (
          <View style={styles.msgRow}>
            <Icon name="checkmark" size={14} color={colors.textPrimary} />
            <Text style={styles.msgText}>{notice}</Text>
          </View>
        ) : null}

        {busy ? (
          <View style={styles.busy}><ActivityIndicator color={colors.textPrimary} /></View>
        ) : (
          <FilledButton
            label={isSignup ? 'Create account' : 'Sign in'}
            onPress={submit}
            trailing="→"
            style={styles.submit}
          />
        )}

        <Body style={styles.helper}>
          {isSignup
            ? 'Free to start. Unlimited saves. Cancel anytime.'
            : 'Your saves, summaries and library — synced to you.'}
        </Body>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = themed(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // ── Backdrop: a tilted collage of the user's own saves ──
  // The clip keeps the rotated, oversized grid inside the screen.
  backdropClip: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    overflow: 'hidden',
  },
  // Deliberately larger than the viewport and rotated: at 9° a screen-sized
  // grid would show bare canvas at the corners, and the overhang is what makes
  // the mosaic read as a fragment of something bigger rather than a neat table.
  // The extra vertical room also hides the loop seam off-screen.
  backdrop: {
    position: 'absolute',
    top: '-30%', left: '-16%', right: '-16%', bottom: '-30%',
    flexDirection: 'row',
    transform: [{ rotate: '-9deg' }, { scale: 1.12 }],
  },
  driftCol: { flex: 1, overflow: 'hidden' },
  frame: {
    width: '100%',
    height: TILE_H,
    borderWidth: 0.5,
    borderColor: colors.ghostLine,
    padding: spacing.sm,
    backgroundColor: colors.card,
  },
  frameImg: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    width: '100%', height: '100%',
  },
  frameIndex: { opacity: 0.5 },
  // ⚠️ The scrim is the CANVAS colour, not black — so it darkens the photos in
  // dark mode and lightens them in light mode. The wordmark on top is
  // `textPrimary`, which inverts to match, and legibility holds in both. A
  // fixed black scrim would leave black-on-black text in light mode.
  scrim: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: colors.background,
    opacity: 0.78,
  },

  // ── Step 1 ──
  welcome: { flex: 1, paddingHorizontal: spacing.lg, justifyContent: 'flex-end' },
  welcomeMid: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  welcomeSub: { marginTop: spacing.md, textAlign: 'center' },
  authRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.md },
  // Square, not circular. The reference app's circular auth buttons are one of
  // its most recognisable marks; this system is 0-radius everywhere anyway.
  authBtn: {
    width: 76, height: 76,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authHint: { textAlign: 'center', marginTop: spacing.md },
  legal: {
    color: colors.textTertiary,
    fontFamily: typeface.body,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  legalStrong: { color: colors.textSecondary, textDecorationLine: 'underline' },

  // ── Step 2 ──
  formInner: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  back: { alignSelf: 'flex-start', paddingVertical: spacing.sm, paddingRight: spacing.md },
  formWordmark: { marginTop: spacing.xl, marginBottom: spacing.xl },
  modes: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  modeDiv: { width: 1, height: 10, backgroundColor: colors.ghostLine },

  fields: { marginTop: spacing.lg, gap: spacing.lg },
  field: { gap: spacing.xs },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    flex: 1,
    color: colors.textPrimary,
    fontFamily: typeface.body,
    fontSize: font.lg,
    paddingVertical: spacing.sm,
  },
  fieldRule: { height: 1, backgroundColor: colors.ghostLine },
  fieldRuleOn: { backgroundColor: colors.textPrimary },

  strengthWrap: { gap: spacing.sm },
  strengthTrack: { flexDirection: 'row', gap: 3 },
  strengthSeg: { flex: 1, height: 2, backgroundColor: colors.ghostLine },
  strengthSegOn: { backgroundColor: colors.textPrimary },

  msgRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
  msgText: {
    color: colors.textPrimary,
    fontFamily: typeface.body,
    fontSize: font.sm,
    flex: 1,
    lineHeight: 18,
  },

  busy: { marginTop: spacing.xl, paddingVertical: spacing.md, alignItems: 'center' },
  submit: { marginTop: spacing.xl },
  helper: { marginTop: spacing.md, fontSize: font.sm, textAlign: 'center' },
}));
