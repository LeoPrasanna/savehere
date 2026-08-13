import { useState, useCallback, useRef, memo } from 'react';
import {
  View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '../components/Icon';
import { Pressable } from '../components/Pressable';
import { Label, Body, Title, Rule, FilledButton } from '../components/kit';
import { useAuth, AVATAR_OPTIONS } from '../contexts/AuthContext';
import { AVATARS, avatarLabel, DEFAULT_AVATAR_KEY } from '../constants/avatars';
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
  // Falls back to the default face so the GRID agrees with what the rest of the
  // app is already drawing for this user (Avatar.tsx applies the same default).
  // A picker showing nothing selected while the header showed a panda would be
  // the app disagreeing with itself.
  const [avatar, setAvatar] = useState<string | undefined>(profile.avatar ?? DEFAULT_AVATAR_KEY);
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
  /**
   * ⚠️ A REF, NOT A DEP. `pick` must keep a stable identity — `AvatarCell` is
   * memoised on it and 102 cells re-render otherwise — but it now needs to know
   * the CURRENT selection to toggle it. Reading through a ref gives it that
   * without putting `avatar` in the dependency array.
   */
  const avatarRef = useRef(avatar);
  avatarRef.current = avatar;

  /**
   * AUTO-SAVES. No Save button for a face (owner, 2026-08-12).
   *
   * Picking an avatar is a single, self-describing, instantly-reversible
   * choice — the picked cell already shows a check, so the screen has ALREADY
   * told you it is set. Requiring Save after that is the classic trap: it looks
   * done, you leave, and it isn't. The name fields above still need Save,
   * because a half-typed name is not a finished intent; a tapped face always is.
   *
   * ⚠️ The write is fired here and NOT inside a `setAvatar` updater. A state
   * updater must stay pure — React invokes it twice under StrictMode, which
   * would have sent the request twice per tap.
   *
   * `null`, not `undefined`, when deselecting — see the long note in `save()`:
   * JSON.stringify drops undefined keys, so `undefined` would leave the old
   * avatar on the server and it would reappear at the next token refresh.
   */
  const pick = useCallback((key: string) => {
    if (busy) return;
    const previous = avatarRef.current;
    /**
     * ⚠️ NO TOGGLE-OFF ANY MORE. Tapping the selected face used to clear it
     * ("choosing is never a one-way door"). That made sense when un-chosen
     * meant a neutral glyph — it does not now that un-chosen renders the FIRST
     * avatar (see Avatar.tsx). Clearing would have silently jumped you to a
     * different picture rather than to "none", which is not a door at all.
     * There is always a face; you only ever change which one.
     */
    if (previous === key) return;
    const next = key;
    setAvatar(next);
    // Optimistic: the grid must answer the tap now. But a failure reverts and
    // says so — silently keeping a face the server never stored is worse than
    // the round-trip we just avoided.
    updateProfile({ avatar: next ?? null }).then(({ error: err }) => {
      if (err) { haptics.error(); setAvatar(previous); setError(err); }
      else { haptics.tap(); setError(''); }
    });
  }, [busy, updateProfile]);

  /**
   * Has anything actually changed? (owner, 2026-08-13: "the Save button is
   * misleading" — it was always live, so it looked like there was something to
   * save even when you had only opened the screen to look.)
   *
   * ⚠️ THE AVATAR IS NOT IN HERE, and that is not an oversight. Picking a face
   * writes itself immediately (see `pick` above), so it can never be an unsaved
   * change — including it would light the button up for something already
   * saved, which is the exact confusion this removes.
   *
   * Trimmed on both sides so typing a space and deleting it doesn't count, and
   * `?? ''` because the stored value is null for a cleared field while the
   * input holds ''.
   */
  const dirty =
    firstName.trim() !== (profile.first_name ?? '').trim() ||
    lastName.trim() !== (profile.last_name ?? '').trim() ||
    nickname.trim() !== (profile.nickname ?? '').trim();

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
    /* behavior="padding" on Android too — see the note in LoginScreen.tsx. */
    <KeyboardAvoidingView style={styles.container} behavior="padding">
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

        {/* ── Save, ABOVE the picture grid (owner, 2026-08-12) ──────────────
            It used to sit at the very bottom, below 92 avatars — roughly four
            screens of scrolling past content that does not need saving to
            reach the button for the three fields that do. Now it sits directly
            under those fields, which is the only thing it acts on: the picture
            writes itself the moment you tap it. Errors surface here too, next
            to the inputs that caused them. */}
        {error ? (
          <View style={styles.errorRow}>
            <Icon name="alert-circle" size={14} color={colors.textPrimary} />
            <Body tone="primary" style={styles.errorText}>{error}</Body>
          </View>
        ) : null}

        {busy ? (
          <View style={styles.busy}><ActivityIndicator color={colors.textPrimary} /></View>
        ) : (
          /* Disabled until one of the three name fields differs from what is
             stored. Kept as a real (dimmed) button rather than hidden — a
             control that disappears is harder to find than one that is plainly
             not needed yet. */
          <FilledButton label="Save" onPress={save} disabled={!dirty} style={styles.save} />
        )}

        <Rule style={{ marginTop: spacing.xl }} />

        {/* Says the picture saves itself, so nobody hunts for the Save button
            above and wonders why it is not needed here. */}
        <Label style={styles.avatarLabel}>Profile picture — saves as you pick</Label>
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
        {/* ⚠️ No Save button down here any more — it moved ABOVE the grid.
            Do not "restore" it: a second Save at the bottom would imply the
            avatar grid needs saving, and it does not. */}
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
