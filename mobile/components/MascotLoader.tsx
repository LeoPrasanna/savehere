import { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, AccessibilityInfo } from 'react-native';
import { MotiView } from 'moti';
import { Icon } from './Icon';
import { useAuth } from '../contexts/AuthContext';
import { avatarSource, isLegacyAvatar } from '../constants/avatars';
import { colors, spacing, font, tracking, typeface, themed } from '../constants/theme';

/**
 * The waiting state for the to-do screen, in place of a bare spinner.
 *
 * ── WHY THE USER'S OWN AVATAR AND NOT A DRAWN CHARACTER ────────────────────
 * Owner's direction: the mascot IS the profile picture. That turns out to be
 * the only honest option available anyway — there is no image-generation tool
 * in this environment, so a bespoke mascot could not be authored, and the 92
 * avatar PNGs have no alternate poses. Reusing the face the user already chose
 * costs zero new bytes and is more personal than a stock character would be.
 *
 * ⚠️ ASKED FOR AS AN ANIMATED GIF. Built in code instead, for the same reasons
 * the login wall's animation was: a GIF is a fixed-size, block-compressed asset
 * that ships in every bundle forever, cannot follow the colour scheme, and
 * would need one variant per avatar (92 of them) to work here at all. The coded
 * version weighs nothing, stays sharp at any density, and animates whichever
 * face the user picked.
 *
 * ⚠️ THIS DELIBERATELY HAS NO COMPLETION STATE. It briefly ended on a
 * two-handed thumbs-up; that moved to `TodoGoalBar` (owner, 2026-08-10)
 * because a celebration belongs on something the PERSON did, not on a fetch
 * returning. A loader that congratulates you for waiting is the thing to avoid.
 *
 * ── MOTION ────────────────────────────────────────────────────────────────
 * The bob is the only loop, and a loader is the one place this system's "no
 * looping decoration" rule does not apply — a still image during a
 * multi-second wait reads as a frozen app. It stops existing the moment the
 * list mounts, which is the same licence `SkeletonCard`'s pulse runs on.
 */

/** Height of the bob, in px. Small on purpose: this sits behind a cold-start
 *  wait, not a game. */
const BOB = 7;
const BOB_MS = 700;

/** ⚠️ Nothing renders for this long. A warm backend answers in under ~300 ms,
 *  and without this gate the user gets a 200 ms flash of mascot followed
 *  immediately by the list — which reads as a rendering glitch, not warmth. */
const APPEAR_AFTER_MS = 350;

/** When the wait passes this, say WHY. Render's free tier cold-starts for tens
 *  of seconds and silence is the thing that makes it feel broken. Quality bar
 *  #1: fail (and wait) with a clear human message. */
const COLD_START_MS = 2500;

export function MascotLoader({ label }: { label?: string } = {}) {
  const { profile } = useAuth();
  const [reduceMotion, setReduceMotion] = useState(false);
  const [visible, setVisible] = useState(false);
  const [coldStart, setColdStart] = useState(false);

  useEffect(() => {
    const a = setTimeout(() => setVisible(true), APPEAR_AFTER_MS);
    const b = setTimeout(() => setColdStart(true), COLD_START_MS);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);

  // Continuous motion is exactly what this setting exists to stop, and a
  // waiting screen is not the place to overrule it.
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(v => { if (alive) setReduceMotion(!!v); })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { alive = false; sub?.remove?.(); };
  }, []);

  const src = avatarSource(profile.avatar);

  if (!visible) return <View style={styles.wrap} />;

  const face = src ? (
    <Image source={src} style={styles.face} resizeMode="contain" fadeDuration={0} />
  ) : isLegacyAvatar(profile.avatar) ? (
    <Text style={styles.faceEmoji}>{profile.avatar}</Text>
  ) : (
    // Nobody has picked a face yet — the same neutral mark the header and the
    // profile panel fall back to, so the app never invents an identity.
    <Icon name="user" size={38} color={colors.textPrimary} />
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.stage}>
        <View style={styles.frameWrap}>
          <MotiView
            from={{ translateY: 0 }}
            animate={reduceMotion ? { translateY: 0 } : { translateY: -BOB }}
            transition={reduceMotion
              ? { type: 'timing', duration: 0 }
              : { type: 'timing', duration: BOB_MS, loop: true }}
            style={styles.frame}
          >
            {face}
          </MotiView>
        </View>

      </View>

      <View style={styles.captions}>
        <Text style={styles.caption}>{label ?? 'GETTING YOUR SLATE'}</Text>
        {/* The single most useful thing on this screen during a real wait, and
            the reason it is worth more than a prettier spinner: it names the
            cause instead of leaving the user to assume the app is broken. */}
        {coldStart && (
          <Text style={styles.sub}>
            Waking the server — this can take a few seconds
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  stage: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },

  frameWrap: { alignItems: 'center', justifyContent: 'center' },
  // Hairline square, the same frame grammar as the header avatar and the
  // onboarding figure slot. 0 radius, like everything that is not one of the
  // three sanctioned circles.
  frame: {
    width: 96, height: 96,
    borderWidth: 1,
    borderColor: colors.ghostLine,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  face: { width: 82, height: 82 },
  faceEmoji: { fontSize: 44, lineHeight: 54 },



  captions: { alignItems: 'center', gap: spacing.sm },
  caption: {
    color: colors.textTertiary,
    fontFamily: typeface.label,
    fontSize: font.xs,
    letterSpacing: tracking.labelWide,
  },
  sub: {
    color: colors.textTertiary,
    fontFamily: typeface.body,
    fontSize: font.sm,
    textAlign: 'center',
    maxWidth: 260,
  },
}));
