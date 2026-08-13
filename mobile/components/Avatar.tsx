import { Image, Text, StyleSheet } from 'react-native';
import { Icon } from './Icon';
import { avatarSource, isLegacyAvatar, DEFAULT_AVATAR_KEY } from '../constants/avatars';
import { colors, themed } from '../constants/theme';

/**
 * The user's face — all three states it can genuinely be in.
 *
 * ⚠️ The middle branch is the one worth having a component for. `profile.avatar`
 * holds an asset key today (`18_astronaut`), but accounts that picked a face
 * before 2026-08-10 still hold the raw emoji character and were deliberately
 * never migrated — see `constants/avatars.ts`. Drawing those as TEXT is what
 * keeps an existing user's face from vanishing in the release that changed the
 * picker, and it is exactly the branch someone copying the "obvious" two cases
 * would drop.
 *
 * Ratios come from the sites that inlined this before it existed: emoji ≈ 0.55
 * of the box, fallback glyph ≈ 0.5.
 *
 * ⚠️ `iconSize` exists because those sites were hand-tuned and DO NOT sit on a
 * single ratio — the glyph gets proportionally smaller as the frame grows
 * (0.529 at 34pt, 0.500 at 48pt, 0.463 at 82pt). No one ratio reproduces all
 * three, and the default would have grown the to-do loader's fallback face
 * from 38 to 41 (+8%) as a silent side effect of a refactor. Fitting a curve
 * to three hand-picked points would be worse than one optional number. Pass it
 * where an existing pixel value has to be preserved; omit it for new surfaces.
 *
 * The FRAME (border, background, hit target) stays at the call site — those
 * differ per surface and are not this component's business.
 */
export function Avatar({ value, size, iconSize }: {
  value?: string | null;
  size: number;
  iconSize?: number;
}) {
  const src = avatarSource(value);

  if (src) {
    return (
      <Image
        source={src}
        style={{ width: size, height: size }}
        resizeMode="contain"
        // Android cross-fades images in over 300ms by default; these are
        // bundled assets, so the fade is pure invented latency.
        fadeDuration={0}
      />
    );
  }

  if (isLegacyAvatar(value)) {
    return (
      <Text style={[styles.emoji, { fontSize: Math.round(size * 0.55), lineHeight: Math.round(size * 0.7) }]}>
        {value}
      </Text>
    );
  }

  /**
   * Nobody has picked one — so they get the FIRST avatar (owner, 2026-08-12).
   *
   * ⚠️ This reverses the previous rule here, which was "the neutral mark, never
   * an invented identity". The owner's call, and it holds up: a generic person
   * glyph was not neutral so much as unfinished-looking, and it is the first
   * thing on the home header, the profile panel and the to-do dashboard.
   *
   * Nothing is written to the profile — see DEFAULT_AVATAR_KEY. So this also
   * covers every existing account that never picked a face, with no backfill.
   *
   * It also catches WITHDRAWN keys (the ten pulled for trademark reasons): they
   * are not legacy emoji and resolve to no image, and this branch is where they
   * land. A default face beats an empty frame there too.
   */
  const fallback = avatarSource(DEFAULT_AVATAR_KEY);
  if (fallback) {
    return (
      <Image
        source={fallback}
        style={{ width: size, height: size }}
        resizeMode="contain"
        fadeDuration={0}
      />
    );
  }

  // Only reachable if the avatar set is empty — keep a real mark rather than a hole.
  return <Icon name="user" size={iconSize ?? Math.round(size * 0.5)} color={colors.textPrimary} />;
}

const styles = themed(() => StyleSheet.create({
  emoji: { color: colors.textPrimary },
}));
