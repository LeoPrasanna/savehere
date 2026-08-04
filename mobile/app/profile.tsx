import { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '../components/Icon';
import { Pressable } from '../components/Pressable';
import { Label, Body, Title, Rule, FilledButton } from '../components/kit';
import { useAuth, AVATAR_OPTIONS } from '../contexts/AuthContext';
import * as haptics from '../services/haptics';
import { TAB_BAR_CLEARANCE } from '../components/TabBar';
import { colors, spacing, font, typeface, themed } from '../constants/theme';

/** Underlined field — a rule, not a box. Same grammar as login and save. */
function Field({ label, optional, ...rest }: any) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Label>{optional ? `${label} — optional` : label}</Label>
      <TextInput
        style={styles.input}
        placeholderTextColor={colors.textTertiary}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...rest}
      />
      <View style={[styles.fieldRule, focused && styles.fieldRuleOn]} />
    </View>
  );
}

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
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Label wide>Signed in as</Label>
        <Title style={styles.email} numberOfLines={1}>{email ?? '—'}</Title>
        <Rule style={{ marginTop: spacing.lg }} />

        <Field
          label="First name" value={firstName} onChangeText={setFirstName}
          placeholder="Required" autoCapitalize="words" editable={!busy}
        />
        <Field
          label="Last name" optional value={lastName} onChangeText={setLastName}
          placeholder="Optional" autoCapitalize="words" editable={!busy}
        />
        <Field
          label="Nickname" optional value={nickname} onChangeText={setNickname}
          placeholder="What we'll call you" autoCapitalize="words" editable={!busy}
          onSubmitEditing={save} returnKeyType="done"
        />

        {/* Pick a face. Tapping the selected one again clears it, so choosing is
            never a one-way door. Selection reads by border weight — the system
            has no accent hue to mark it with. */}
        <Label style={styles.avatarLabel}>Profile picture — optional</Label>
        <View style={styles.avatarGrid}>
          {AVATAR_OPTIONS.map((emoji) => {
            const selected = avatar === emoji;
            return (
              <Pressable
                key={emoji}
                onPress={() => !busy && setAvatar(selected ? undefined : emoji)}
                style={[styles.avatarCell, selected && styles.avatarCellOn]}
                accessibilityLabel={`Avatar ${emoji}${selected ? ', selected' : ''}`}
              >
                <Text style={styles.avatarCellEmoji}>{emoji}</Text>
              </Pressable>
            );
          })}
        </View>

        {error ? (
          <View style={styles.errorRow}>
            <Icon name="alert-circle" size={14} color={colors.textPrimary} />
            <Body tone="primary" style={styles.errorText}>{error}</Body>
          </View>
        ) : null}

        {busy ? (
          <View style={styles.busy}><ActivityIndicator color={colors.textPrimary} /></View>
        ) : (
          <FilledButton label="Save" onPress={save} style={styles.save} />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// themed(): this sheet bakes in token values, and every one of them inverts
// between light and dark. See constants/theme.ts.
const styles = themed(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  inner: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: TAB_BAR_CLEARANCE + spacing.xl },
  email: { marginTop: spacing.sm },

  field: { gap: spacing.xs, marginTop: spacing.lg },
  input: {
    color: colors.textPrimary,
    fontFamily: typeface.body,
    fontSize: font.lg,
    paddingVertical: spacing.sm,
  },
  fieldRule: { height: 1, backgroundColor: colors.ghostLine },
  fieldRuleOn: { backgroundColor: colors.textPrimary },

  avatarLabel: { marginTop: spacing.xl, marginBottom: spacing.sm },
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  avatarCell: {
    width: 48, height: 48,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 0.5, borderColor: colors.ghostLine,
  },
  avatarCellOn: { borderWidth: 1, borderColor: colors.textPrimary },
  avatarCellEmoji: { fontSize: 24, lineHeight: 30 },

  errorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
  errorText: { flex: 1, fontSize: font.sm },

  busy: { marginTop: spacing.xl, paddingVertical: spacing.md, alignItems: 'center' },
  save: { marginTop: spacing.xl },
}));
