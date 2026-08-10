import { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '../components/Icon';
import { Pressable } from '../components/Pressable';
import { Label, Body, Title, Rule, FilledButton } from '../components/kit';
import { useAuth, AVATAR_OPTIONS } from '../contexts/AuthContext';
import { AVATARS, avatarLabel } from '../constants/avatars';
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
        {/* ponytail: all 102 avatars mount at once inside the page ScrollView —
            no windowing. Download cost is settled (4.5 KB each), but decoded
            they are ~65 KB of bitmap apiece, so the picker peaks around 6–7 MB
            of image memory while it is open. Fine on any phone of the last
            decade and it frees on unmount. If the set grows past ~200, or this
            ever janks on a low-end Android, move it to a FlatList with
            numColumns and windowSize — not before. */}
        <View style={styles.avatarGrid}>
          {AVATAR_OPTIONS.map((key) => {
            const selected = avatar === key;
            return (
              <Pressable
                key={key}
                onPress={() => !busy && setAvatar(selected ? undefined : key)}
                style={[styles.avatarCell, selected && styles.avatarCellOn]}
                accessibilityLabel={`Avatar ${avatarLabel(key)}${selected ? ', selected' : ''}`}
              >
                {/* fadeDuration={0}: React Native's Image fades in over 300ms
                    on Android by default. Across a grid of 92 that reads as the
                    picker "loading slowly" when the bytes are already there —
                    they are bundled 4.5 KB assets, not network fetches. Killing
                    the fade is the whole speed fix; there is no download to
                    optimise. */}
                <Image
                  source={AVATARS[key]}
                  style={styles.avatarCellImg}
                  resizeMode="contain"
                  fadeDuration={0}
                />
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
  // 40 inside a 48 cell — the art is illustrated and needs breathing room the
  // way an emoji glyph did not, or the grid reads as a solid sheet of colour.
  avatarCellImg: { width: 40, height: 40 },

  errorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
  errorText: { flex: 1, fontSize: font.sm },

  busy: { marginTop: spacing.xl, paddingVertical: spacing.md, alignItems: 'center' },
  save: { marginTop: spacing.xl },
}));
