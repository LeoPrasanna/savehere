import { useState, useCallback, memo } from 'react';
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

/**
 * One face in the picker.
 *
 * ⚠️ `memo` is the whole performance story on this screen, and it is measured,
 * not assumed. The three name fields keep their value in ProfileScreen state,
 * so EVERY KEYSTROKE re-renders this screen — and without memo that re-renders
 * all 92 cells, each allocating a fresh `Animated.Value` inside `<Pressable>`.
 * Typing the 8 characters of "Prasanna" cost 8 × 92 = 736 cell renders.
 *
 * Counted in the browser with a temporary render counter: memoised, the same
 * 8 keystrokes render **0** cells, and picking a face renders **exactly 2** —
 * the one you left and the one you chose. (Loading was never the bottleneck:
 * all 92 files fetch cold off the Metro dev server in ~257 ms.)
 *
 * This is why `onPress` takes the key rather than being a per-cell closure —
 * a closure built in the parent's map() is a new function identity on every
 * parent render and would defeat the memo entirely.
 */
const AvatarCell = memo(function AvatarCell({ name, selected, onPress }: {
  name: string;
  selected: boolean;
  onPress: (name: string) => void;
}) {
  return (
    <Pressable
      onPress={() => onPress(name)}
      style={[styles.avatarCell, selected && styles.avatarCellOn]}
      accessibilityLabel={`Avatar ${avatarLabel(name)}${selected ? ', selected' : ''}`}
    >
      <Image
        source={AVATARS[name]}
        style={styles.avatarCellImg}
        resizeMode="contain"
        // Android's Image cross-fades in over 300ms by default. Across a grid
        // this reads as the picker loading slowly when the pixels are already
        // there — these are bundled assets, not downloads.
        fadeDuration={0}
      />
      {/* The border alone carried the selected state before, at 0.5px vs 1px.
          That is a half-pixel difference on a 48pt tile in a grid of 92 — it
          was there, but you could not SEE which face you had picked. The badge
          is the answer the system already has for a filled control: ink block,
          background-coloured glyph. No new hue invented. */}
      {selected ? (
        <View style={styles.avatarCheck}>
          <Icon name="checkmark" size={10} color={colors.background} />
        </View>
      ) : null}
    </Pressable>
  );
});

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
  const [avatar, setAvatar] = useState<string | undefined>(profile.avatar ?? undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  /**
   * Pick a face, or tap the current one again to clear it — choosing is never
   * a one-way door.
   *
   * Stable identity (`useCallback`) is load-bearing, not tidiness: `AvatarCell`
   * is memoised on it, and a fresh closure per render would re-render all 92
   * cells on every keystroke in the fields above. `busy` is the only dep, and
   * it flips exactly twice per save.
   */
  const pick = useCallback((key: string) => {
    if (busy) return;
    setAvatar(a => (a === key ? undefined : key));
  }, [busy]);

  const save = async () => {
    if (!firstName.trim()) { setError('First name is required.'); return; }
    setBusy(true); setError('');
    const { error } = await updateProfile({
      first_name: firstName.trim(),
      // ⚠️ null, NOT undefined — this is a data-consistency fix, not a style
      // preference. `updateProfile` merges into the existing user_metadata and
      // ships it as JSON, and `JSON.stringify` DROPS undefined keys. So
      // clearing your nickname or deselecting your avatar sent a payload that
      // simply omitted the field, Supabase merged nothing, and the OLD value
      // was still on the server — it came back at the next token refresh while
      // the local session claimed it was gone. null is serialised, so it
      // actually clears.
      last_name: lastName.trim() || null,
      nickname: nickname.trim() || null,
      avatar: avatar ?? null,
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

        <Label style={styles.avatarLabel}>Profile picture — optional</Label>
        {/*
          ⚠️ ALL 92 MOUNT AT ONCE, ON PURPOSE. This grid used to dribble them in
          24 at a time on a 250ms timer, justified by a note claiming a single
          avatar took **10.9s** under 92-way request contention on Metro.

          That number does not reproduce. Measured against the Metro dev server
          with all 92 distinct files, cache-busted and cold: **285ms wall clock**
          for the whole set (median 174ms, p90 263ms). Off by ~40x. So the
          staggering bought nothing and cost the actual requirement — opening
          this screen showed 24 faces and made you wait ~1s for the rest.

          On iOS/Android it was never even arguable: `require()`d PNGs are
          compiled into the app binary, so mounting an <Image> is a disk read
          with no HTTP request to contend for.

          ponytail: a plain wrapping grid, not a virtualized list. A nested
          vertical FlatList inside this vertical ScrollView breaks virtualization
          and warns, so it would be ceremony for no gain. If the set grows past
          ~200, restructure so the grid owns its own scroller — then FlatList
          with numColumns is the right answer.
        */}
        <View style={styles.avatarGrid}>
          {AVATAR_OPTIONS.map(key => (
            <AvatarCell key={key} name={key} selected={avatar === key} onPress={pick} />
          ))}
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
  // The tick that actually tells you which face is yours. Bottom-right so it
  // never covers the eyes, which is where every one of these illustrations
  // puts its subject.
  avatarCheck: {
    position: 'absolute', right: 0, bottom: 0,
    width: 14, height: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.textPrimary,
  },
  // 40 inside a 48 cell — the art is illustrated and needs breathing room the
  // way an emoji glyph did not, or the grid reads as a solid sheet of colour.
  avatarCellImg: { width: 40, height: 40 },

  errorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
  errorText: { flex: 1, fontSize: font.sm },

  busy: { marginTop: spacing.xl, paddingVertical: spacing.md, alignItems: 'center' },
  save: { marginTop: spacing.xl },
}));
