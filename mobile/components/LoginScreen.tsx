import { useState, useRef } from 'react';
import {
  View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, Image, TextInputProps, LayoutChangeEvent, Animated,
} from 'react-native';
import type { ReactNode, Dispatch, SetStateAction } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import { Icon } from './Icon';
import { Pressable } from './Pressable';
import { AuroraBackground } from './AuroraBackground';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import * as haptics from '../services/haptics';
import { colors, spacing, font, radius, gradients, shadow } from '../constants/theme';

type Mode = 'signin' | 'signup';
type FieldName = 'first' | 'last' | 'nick' | 'email' | 'password';

// Surface Supabase's auth errors as short, human messages.
function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login')) return 'Wrong email or password.';
  if (m.includes('already registered')) return 'That email already has an account — sign in instead.';
  if (m.includes('password should be')) return 'Password must be at least 6 characters.';
  if (m.includes('unable to validate email') || m.includes('invalid email')) return 'Enter a valid email address.';
  if (m.includes('network')) return "Couldn't reach the server. Check your connection.";
  return message || 'Something went wrong. Try again.';
}

// A single rounded input row with a leading icon that lights up violet on focus.
type FieldProps = TextInputProps & {
  icon: string;
  name: FieldName;
  focused: FieldName | null;
  setFocused: Dispatch<SetStateAction<FieldName | null>>;
  trailing?: ReactNode;
};

function Field({ icon, name, focused, setFocused, trailing, ...rest }: FieldProps) {
  const isFocused = focused === name;
  return (
    <View style={[styles.inputRow, isFocused && styles.inputRowFocus]}>
      <Icon name={icon} size={18} color={isFocused ? colors.accent : colors.textTertiary} />
      <TextInput
        style={styles.input}
        placeholderTextColor={colors.textTertiary}
        onFocus={() => setFocused(name)}
        onBlur={() => setFocused((f) => (f === name ? null : f))}
        {...rest}
      />
      {trailing}
    </View>
  );
}

export function LoginScreen() {
  const { triggerCelebrate } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [focused, setFocused] = useState<FieldName | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [segW, setSegW] = useState(0);

  const isSignup = mode === 'signup';
  const shakeX = useRef(new Animated.Value(0)).current;

  // A quick left-right shake — the universal "that didn't work" cue on a failed login.
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

  const onSegLayout = (e: LayoutChangeEvent) => setSegW(e.nativeEvent.layout.width);
  const pillW = segW > 0 ? (segW - 8) / 2 : 0; // track has 4px padding each side

  const fail = (msg: string) => {
    haptics.error();
    setError(msg);
    shake();
  };

  const submit = async () => {
    const e = email.trim();
    if (!e || !password) { fail('Enter your email and password.'); return; }
    if (mode === 'signup' && !firstName.trim()) { fail('Enter your first name.'); return; }
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

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <AuroraBackground />
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* ── Hero: big, glowing, floating icon ── */}
        <MotiView
          from={{ opacity: 0, scale: 0.6, translateY: 10 }}
          animate={{ opacity: 1, scale: 1, translateY: 0 }}
          transition={{ type: 'spring', damping: 14, stiffness: 140 }}
          style={styles.heroWrap}
        >
          <MotiView
            from={{ translateY: -7 }}
            animate={{ translateY: 7 }}
            transition={{ type: 'timing', duration: 2600, loop: true, repeatReverse: true }}
            style={styles.heroInner}
          >
            {/* soft pulsing glow */}
            <MotiView
              from={{ opacity: 0.3, scale: 0.85 }}
              animate={{ opacity: 0.7, scale: 1.12 }}
              transition={{ type: 'timing', duration: 1800, loop: true, repeatReverse: true }}
              style={styles.glow}
            />
            {/* clean pulsing ring for definition */}
            <MotiView
              from={{ opacity: 0.5, scale: 0.96 }}
              animate={{ opacity: 0.9, scale: 1.04 }}
              transition={{ type: 'timing', duration: 2200, loop: true, repeatReverse: true }}
              style={styles.ring}
            />
            <Image source={require('../assets/icon-mark.png')} style={styles.heroIcon} resizeMode="contain" />
          </MotiView>
        </MotiView>

        {/* ── Wordmark + tagline ── */}
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 500, delay: 160 }}
        >
          <Text style={styles.title}>SaveHere</Text>
          <Text style={styles.tagline}>
            {isSignup ? 'Your second brain for the internet ✨' : 'Welcome back — let’s pick up where you left off 👋'}
          </Text>
        </MotiView>

        {/* ── Glass card (shakes on a failed attempt) ── */}
        <Animated.View style={{ transform: [{ translateX: shakeX }] }}>
          <MotiView
            from={{ opacity: 0, translateY: 18 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 520, delay: 260 }}
            style={styles.card}
          >
            {/* Segmented Sign in / Sign up toggle */}
            <View style={styles.segment} onLayout={onSegLayout}>
              {pillW > 0 && (
                <MotiView
                  animate={{ translateX: isSignup ? pillW : 0 }}
                  transition={{ type: 'spring', damping: 18, stiffness: 200 }}
                  style={[styles.segPill, { width: pillW }]}
                >
                  <LinearGradient colors={gradients.vibrant} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                </MotiView>
              )}
              <Pressable style={styles.segBtn} scaleTo={0.97} onPress={() => switchMode('signin')}>
                <Text style={[styles.segText, !isSignup && styles.segTextActive]}>Sign in</Text>
              </Pressable>
              <Pressable style={styles.segBtn} scaleTo={0.97} onPress={() => switchMode('signup')}>
                <Text style={[styles.segText, isSignup && styles.segTextActive]}>Sign up</Text>
              </Pressable>
            </View>

            {isSignup && (
              <MotiView
                key="signup-fields"
                from={{ opacity: 0, translateY: -6 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ type: 'timing', duration: 260 }}
                style={styles.fieldGroup}
              >
                <Field
                  icon="user" name="first" focused={focused} setFocused={setFocused}
                  value={firstName} onChangeText={setFirstName}
                  placeholder="First name" autoCapitalize="words" editable={!busy}
                  accessibilityLabel="First name"
                />
                <Field
                  icon="user" name="last" focused={focused} setFocused={setFocused}
                  value={lastName} onChangeText={setLastName}
                  placeholder="Last name (optional)" autoCapitalize="words" editable={!busy}
                  accessibilityLabel="Last name, optional"
                />
                <Field
                  icon="sparkles" name="nick" focused={focused} setFocused={setFocused}
                  value={nickname} onChangeText={setNickname}
                  placeholder="Nickname — what we'll call you" autoCapitalize="words" editable={!busy}
                  accessibilityLabel="Nickname, optional"
                />
              </MotiView>
            )}

            <View style={styles.fieldGroup}>
              <Field
                icon="mail" name="email" focused={focused} setFocused={setFocused}
                value={email} onChangeText={setEmail}
                placeholder="you@example.com"
                autoCapitalize="none" autoCorrect={false}
                keyboardType="email-address" inputMode="email" editable={!busy}
                accessibilityLabel="Email"
              />
              <Field
                icon="lock" name="password" focused={focused} setFocused={setFocused}
                value={password} onChangeText={setPassword}
                placeholder={isSignup ? 'Create a password (6+ characters)' : 'Your password'}
                secureTextEntry={!showPw} autoCapitalize="none" editable={!busy}
                onSubmitEditing={submit} returnKeyType="go"
                accessibilityLabel="Password"
                trailing={
                  <Pressable scaleTo={0.85} hitSlop={10} onPress={() => { haptics.tap(); setShowPw((s) => !s); }}>
                    <Icon name={showPw ? 'eye-off' : 'eye'} size={18} color={colors.textTertiary} />
                  </Pressable>
                }
              />
            </View>

            {error ? (
              <View style={styles.errorRow}>
                <Icon name="alert-circle" size={14} color={colors.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
            {notice ? (
              <View style={styles.noticeRow}>
                <Icon name="checkmark" size={14} color={colors.success} />
                <Text style={styles.notice}>{notice}</Text>
              </View>
            ) : null}

            {/* Submit */}
            <Pressable onPress={submit} disabled={busy} style={styles.submitWrap}>
              <LinearGradient colors={gradients.hologram} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.submit}>
                {busy ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <>
                    <Text style={styles.submitText}>{isSignup ? 'Create my account' : 'Sign in'}</Text>
                    <Icon name="arrow-forward" size={18} color="#FFF" />
                  </>
                )}
              </LinearGradient>
            </Pressable>

            <Text style={styles.helper}>
              {isSignup
                ? 'Free to start · unlimited saves · cancel anytime'
                : 'Saved reels, summaries & your library — all synced to you.'}
            </Text>
          </MotiView>
        </Animated.View>

        {/* ── Legal / AI disclaimer ── */}
        <MotiView
          from={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ type: 'timing', duration: 500, delay: 380 }}
        >
          <Text style={styles.legal}>
            By continuing you agree to our <Text style={styles.legalStrong}>Terms</Text> and{' '}
            <Text style={styles.legalStrong}>Privacy Policy</Text>. SaveHere stores links and AI-generated
            summaries for personal reference; saved content belongs to its original creators, and AI summaries
            may be imperfect.
          </Text>
        </MotiView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  inner: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.md },

  // Hero
  heroWrap: { alignSelf: 'center', marginBottom: spacing.xs },
  heroInner: { width: 168, height: 168, alignItems: 'center', justifyContent: 'center' },
  glow: {
    position: 'absolute', width: 150, height: 150, borderRadius: 75,
    backgroundColor: colors.accent,
  },
  ring: {
    position: 'absolute', width: 150, height: 150, borderRadius: 75,
    borderWidth: 1.5, borderColor: colors.accentLight + '66',
  },
  heroIcon: { width: 140, height: 140 },

  // Wordmark
  title: {
    color: colors.textPrimary, fontSize: font.display, fontWeight: '900',
    textAlign: 'center', letterSpacing: -1.5,
  },
  tagline: {
    color: colors.textSecondary, fontSize: font.md, fontWeight: '600', textAlign: 'center',
    marginTop: spacing.xs, paddingHorizontal: spacing.md, lineHeight: 22,
  },

  // Card
  card: {
    backgroundColor: 'rgba(28,25,36,0.72)',
    borderRadius: radius.xl, borderWidth: 1, borderColor: colors.borderLight,
    padding: spacing.lg, gap: spacing.md, marginTop: spacing.sm, ...shadow.md,
  },

  // Segmented toggle
  segment: {
    flexDirection: 'row', backgroundColor: colors.background,
    borderRadius: radius.full, padding: 4, borderWidth: 1, borderColor: colors.border,
  },
  segPill: {
    position: 'absolute', top: 4, left: 4, bottom: 4,
    borderRadius: radius.full, overflow: 'hidden', ...shadow.sm,
  },
  segBtn: { flex: 1, paddingVertical: spacing.sm + 2, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  segText: { color: colors.textSecondary, fontSize: font.sm, fontWeight: '800' },
  segTextActive: { color: '#FFF' },

  // Fields
  fieldGroup: { gap: spacing.sm },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 54,
  },
  inputRowFocus: { borderColor: colors.accent, ...shadow.glow },
  input: { flex: 1, color: colors.textPrimary, fontSize: font.md, paddingVertical: spacing.md },

  errorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  errorText: { color: colors.danger, fontSize: font.sm, flex: 1, fontWeight: '600' },
  noticeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  notice: { color: colors.success, fontSize: font.sm, flex: 1, fontWeight: '600' },

  // Submit
  submitWrap: { marginTop: spacing.xs, borderRadius: radius.md, overflow: 'hidden', ...shadow.glow },
  submit: {
    flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.md,
    alignItems: 'center', justifyContent: 'center', minHeight: 54,
  },
  submitText: { color: '#FFF', fontSize: font.md, fontWeight: '900', letterSpacing: 0.2 },
  helper: { color: colors.textTertiary, fontSize: font.xs, textAlign: 'center', lineHeight: 16 },

  // Legal
  legal: {
    color: colors.textTertiary, fontSize: 11, lineHeight: 16, textAlign: 'center',
    paddingHorizontal: spacing.sm,
  },
  legalStrong: { color: colors.textSecondary, fontWeight: '700' },
});
