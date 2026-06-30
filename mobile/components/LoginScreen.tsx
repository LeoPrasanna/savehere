import { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from './Icon';
import { Pressable } from './Pressable';
import { supabase } from '../services/supabase';
import * as haptics from '../services/haptics';
import { colors, spacing, font, radius, gradients, shadow } from '../constants/theme';

type Mode = 'signin' | 'signup';

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

export function LoginScreen() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const submit = async () => {
    const e = email.trim();
    if (!e || !password) { setError('Enter your email and password.'); return; }
    if (mode === 'signup' && !firstName.trim()) { setError('Enter your first name.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: e, password });
        if (error) throw error;
        haptics.success();
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
        haptics.success();
        // If email confirmation is ON, there's no session yet — tell the user to verify.
        if (!data.session) {
          setNotice('Check your email to confirm your account, then sign in.');
          setMode('signin');
        }
      }
    } catch (err: any) {
      haptics.error();
      setError(friendly(err?.message || ''));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <LinearGradient colors={gradients.vibrant} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <Icon name="bookmark" size={28} color="#FFF" />
        </LinearGradient>

        <Text style={styles.title}>SaveHere</Text>
        <Text style={styles.subtitle}>
          {mode === 'signin' ? 'Welcome back — sign in to your library.' : 'Create an account to save and sync your library.'}
        </Text>

        <View style={styles.form}>
          {mode === 'signup' && (
            <>
              <Text style={styles.label}>First name</Text>
              <TextInput
                style={styles.input}
                value={firstName}
                onChangeText={setFirstName}
                placeholder="Prasanna"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="words"
                editable={!busy}
              />
              <Text style={styles.label}>Last name <Text style={styles.optional}>(optional)</Text></Text>
              <TextInput
                style={styles.input}
                value={lastName}
                onChangeText={setLastName}
                placeholder="Yempada"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="words"
                editable={!busy}
              />
              <Text style={styles.label}>Nickname <Text style={styles.optional}>(what we'll call you)</Text></Text>
              <TextInput
                style={styles.input}
                value={nickname}
                onChangeText={setNickname}
                placeholder="optional"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="words"
                editable={!busy}
              />
            </>
          )}

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            inputMode="email"
            editable={!busy}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'}
            placeholderTextColor={colors.textTertiary}
            secureTextEntry
            autoCapitalize="none"
            editable={!busy}
            onSubmitEditing={submit}
            returnKeyType="go"
          />

          {error ? (
            <View style={styles.errorRow}>
              <Icon name="alert-circle" size={14} color={colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}

          <Pressable onPress={submit} disabled={busy} style={styles.submitWrap}>
            <LinearGradient colors={gradients.vibrant} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.submit}>
              {busy ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.submitText}>{mode === 'signin' ? 'Sign in' : 'Create account'}</Text>
              )}
            </LinearGradient>
          </Pressable>

          <Pressable
            onPress={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setNotice(''); }}
            disabled={busy}
            scaleTo={1}
            style={styles.switchRow}
          >
            <Text style={styles.switchText}>
              {mode === 'signin' ? "New here? " : 'Already have an account? '}
              <Text style={styles.switchLink}>{mode === 'signin' ? 'Create an account' : 'Sign in'}</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  inner: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  hero: {
    width: 64, height: 64, borderRadius: radius.lg, alignSelf: 'center',
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md, ...shadow.md,
  },
  title: { color: colors.textPrimary, fontSize: font.xxl, fontWeight: '800', textAlign: 'center' },
  subtitle: {
    color: colors.textSecondary, fontSize: font.sm, textAlign: 'center',
    marginBottom: spacing.lg, paddingHorizontal: spacing.lg,
  },
  form: { gap: spacing.xs },
  label: { color: colors.textSecondary, fontSize: font.xs, fontWeight: '700', marginTop: spacing.sm },
  optional: { color: colors.textTertiary, fontWeight: '500' },
  input: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    color: colors.textPrimary, fontSize: font.md,
  },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  errorText: { color: colors.danger, fontSize: font.sm, flex: 1 },
  notice: { color: colors.success, fontSize: font.sm, marginTop: spacing.sm },
  submitWrap: { marginTop: spacing.lg, borderRadius: radius.md, overflow: 'hidden', ...shadow.md },
  submit: { paddingVertical: spacing.md, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  submitText: { color: '#FFF', fontSize: font.md, fontWeight: '800' },
  switchRow: { marginTop: spacing.lg, alignItems: 'center' },
  switchText: { color: colors.textSecondary, fontSize: font.sm },
  switchLink: { color: colors.accentLight, fontWeight: '700' },
});
