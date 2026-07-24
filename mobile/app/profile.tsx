import { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '../components/Icon';
import { Pressable } from '../components/Pressable';
import { useAuth, AVATAR_OPTIONS } from '../contexts/AuthContext';
import * as haptics from '../services/haptics';
import { colors, spacing, font, radius, gradients, shadow, themed } from '../constants/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const { email, profile, updateProfile } = useAuth();
  const [firstName, setFirstName] = useState(profile.first_name ?? '');
  const [lastName, setLastName] = useState(profile.last_name ?? '');
  const [nickname, setNickname] = useState(profile.nickname ?? '');
  const [avatar, setAvatar] = useState<string | undefined>(profile.avatar);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!firstName.trim()) { setError('First name is required.'); return; }
    setBusy(true); setError('');
    const { error } = await updateProfile({
      first_name: firstName.trim(),
      last_name: lastName.trim() || undefined,
      nickname: nickname.trim() || undefined,
      avatar,
    });
    setBusy(false);
    if (error) { haptics.error(); setError(error); return; }
    haptics.success();
    router.back();
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Text style={styles.caption}>Signed in as</Text>
        <Text style={styles.email}>{email ?? '—'}</Text>

        <Text style={styles.label}>First name</Text>
        <TextInput
          style={styles.input} value={firstName} onChangeText={setFirstName}
          placeholder="Prasanna" placeholderTextColor={colors.textTertiary}
          autoCapitalize="words" editable={!busy}
        />

        <Text style={styles.label}>Last name <Text style={styles.optional}>(optional)</Text></Text>
        <TextInput
          style={styles.input} value={lastName} onChangeText={setLastName}
          placeholder="Yempada" placeholderTextColor={colors.textTertiary}
          autoCapitalize="words" editable={!busy}
        />

        <Text style={styles.label}>Nickname <Text style={styles.optional}>(what we'll call you)</Text></Text>
        <TextInput
          style={styles.input} value={nickname} onChangeText={setNickname}
          placeholder="optional" placeholderTextColor={colors.textTertiary}
          autoCapitalize="words" editable={!busy} onSubmitEditing={save} returnKeyType="done"
        />

        {/* Pick a face. Tapping the selected one again clears it, so choosing is
            never a one-way door. */}
        <Text style={styles.label}>Profile picture <Text style={styles.optional}>(optional)</Text></Text>
        <View style={styles.avatarGrid}>
          {AVATAR_OPTIONS.map((emoji) => {
            const selected = avatar === emoji;
            return (
              <Pressable
                key={emoji}
                onPress={() => !busy && setAvatar(selected ? undefined : emoji)}
                style={[styles.avatarCell, selected && styles.avatarCellOn]}
                scaleTo={0.9}
              >
                <Text style={styles.avatarCellEmoji}>{emoji}</Text>
              </Pressable>
            );
          })}
        </View>

        {error ? (
          <View style={styles.errorRow}>
            <Icon name="alert-circle" size={14} color={colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Pressable onPress={save} disabled={busy} style={styles.saveWrap}>
          <LinearGradient colors={gradients.vibrant} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.save}>
            {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Save</Text>}
          </LinearGradient>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// themed(): this sheet bakes in accent tokens (the selected avatar cell), and a
// plain StyleSheet.create freezes them at module load — the live accent switch
// would leave these stale. See constants/theme.ts.
const styles = themed(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  inner: { padding: spacing.xl, gap: spacing.xs },
  caption: { color: colors.textTertiary, fontSize: font.xs, fontWeight: '700' },
  email: { color: colors.textPrimary, fontSize: font.md, fontWeight: '700', marginBottom: spacing.md },
  label: { color: colors.textSecondary, fontSize: font.xs, fontWeight: '700', marginTop: spacing.sm },
  optional: { color: colors.textTertiary, fontWeight: '500' },
  avatarGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs,
  },
  avatarCell: {
    width: 48, height: 48, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  avatarCellOn: { borderColor: colors.accent, backgroundColor: colors.cardElevated },
  avatarCellEmoji: { fontSize: 24, lineHeight: 30 },
  input: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    color: colors.textPrimary, fontSize: font.md,
  },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  errorText: { color: colors.danger, fontSize: font.sm, flex: 1 },
  saveWrap: { marginTop: spacing.lg, borderRadius: radius.md, overflow: 'hidden', ...shadow.md },
  save: { paddingVertical: spacing.md, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  saveText: { color: '#FFF', fontSize: font.md, fontWeight: '800' },
}));
