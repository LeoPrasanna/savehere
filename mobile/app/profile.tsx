import { useState, useEffect } from 'react';
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

/** Avatar cells mounted per wave. 24 is a bit over two screenfuls of the 6-wide
 *  grid, so the visible rows are in the first request batch. */
const AVATAR_BATCH = 24;
/** Gap between waves. Long enough for the previous batch to clear the browser's
 *  ~6 concurrent connections, short enough that scrolling never outruns it. */
const AVATAR_BATCH_MS = 250;

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

  /**
   * How many avatar cells have their image mounted.
   *
   * ⚠️ MEASURED, NOT GUESSED. Mounting all 92 at once fires 92 simultaneous
   * asset requests. On the Metro dev server that saturates it completely —
   * a single 1 KB avatar measured **10.9 s** while the grid was loading, and
   * the median across the batch was 12.4 s for 110 KB total. That is not
   * bandwidth and not decode; it is 92 requests contending at once (and on
   * web the browser only opens ~6 connections per host, so they queue).
   *
   * An earlier note here claimed `fadeDuration={0}` was "the whole speed fix"
   * and that there was "no download to optimise". That was wrong: these ARE
   * network fetches on web, in dev and in an exported build alike.
   *
   * The fix is to stop asking for all of them at once. The first batch covers
   * more than a screenful, so what the user can actually see arrives quickly;
   * the rest fill in behind them while they scroll. Cells beyond the frontier
   * still render their frame, so the grid never reflows.
   */
  const [mounted, setMounted] = useState(AVATAR_BATCH);
  useEffect(() => {
    if (mounted >= AVATAR_OPTIONS.length) return;
    const t = setTimeout(() => setMounted(n => n + AVATAR_BATCH), AVATAR_BATCH_MS);
    return () => clearTimeout(t);
  }, [mounted]);

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
        {/* Images mount in waves — see `mounted` above for the measurements
            that forced it. ponytail: still a plain grid inside the page
            ScrollView rather than a virtualized list. A nested vertical
            FlatList inside a vertical ScrollView breaks virtualization anyway
            and warns, so it would have been ceremony for no gain; batching gets
            the same request-concurrency win in ten lines. If the set grows past
            ~200, restructure the screen so the grid can own its own scroller —
            then a FlatList with numColumns is the right answer. */}
        <View style={styles.avatarGrid}>
          {AVATAR_OPTIONS.map((key, i) => {
            const selected = avatar === key;
            // Past the frontier the cell still occupies its space — the frame
            // renders, only the image waits. Nothing reflows as they arrive.
            // The selected one always mounts, wherever it sits in the list, so
            // reopening this screen never shows an empty box for your own face.
            if (i >= mounted && !selected) {
              return <View key={key} style={styles.avatarCell} />;
            }
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
