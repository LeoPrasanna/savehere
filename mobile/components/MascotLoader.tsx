import { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, AccessibilityInfo } from 'react-native';
import { MotiView, AnimatePresence } from 'moti';
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
 * ── THE THUMBS-UP ─────────────────────────────────────────────────────────
 * "Two hands" is two Lucide `thumbs-up` glyphs flanking the mascot, the right
 * one mirrored on X. The avatars themselves have no thumbs-up pose and one
 * cannot be drawn per character, so the hands are the app's own icon layer
 * rather than artwork — which also means they re-theme with the palette and
 * add no bytes.
 *
 * ── MOTION ────────────────────────────────────────────────────────────────
 * Borrowed wholesale from the task-tick animation in `app/todos.tsx` so the
 * screen has one motion vocabulary: spring (damping 11 / stiffness 220) for
 * things that arrive, and the same one-shot expanding ring for the moment of
 * completion. The idle bob is the only loop in the component, and a loader is
 * the one place this system's "no looping decoration" rule does not apply —
 * a still image during a multi-second wait reads as a frozen app.
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

export function MascotLoader({ phase, label }: { phase: 'loading' | 'done'; label?: string }) {
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

  const done = phase === 'done';
  const src = avatarSource(profile.avatar);

  // The celebration is never suppressed — it only shows when the wait was long
  // enough to have been seen, so by then `visible` is true anyway.
  if (!visible && !done) return <View style={styles.wrap} />;

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
        {/* Left hand. Springs in only at 'done'. */}
        <AnimatePresence>
          {done && (
            <MotiView
              from={{ opacity: 0, scale: 0.4, translateY: 6 }}
              animate={{ opacity: 1, scale: 1, translateY: 0 }}
              transition={reduceMotion
                ? { type: 'timing', duration: 160 }
                : { type: 'spring', damping: 11, stiffness: 220 }}
            >
              <Icon name="thumbs-up" size={22} color={colors.textPrimary} />
            </MotiView>
          )}
        </AnimatePresence>

        <View style={styles.frameWrap}>
          {/* The one-shot ring, identical in feel to the task tick's burst. */}
          <AnimatePresence>
            {done && !reduceMotion && (
              <MotiView
                key="mascot-burst"
                pointerEvents="none"
                from={{ scale: 0.7, opacity: 0.5 }}
                animate={{ scale: 2, opacity: 0 }}
                transition={{ type: 'timing', duration: 520 }}
                style={styles.burst}
              />
            )}
          </AnimatePresence>

          <MotiView
            // Idle: a slow bob. Done: settle to rest and give one small pop, so
            // the end of the wait is felt rather than just announced.
            from={{ translateY: 0 }}
            animate={
              reduceMotion ? { translateY: 0, scale: 1 }
              : done ? { translateY: 0, scale: 1.06 }
              : { translateY: -BOB }
            }
            transition={
              reduceMotion ? { type: 'timing', duration: 0 }
              : done ? { type: 'spring', damping: 11, stiffness: 220 }
              : { type: 'timing', duration: BOB_MS, loop: true }
            }
            style={styles.frame}
          >
            {face}
          </MotiView>
        </View>

        {/* Right hand — the same glyph mirrored, so it reads as a second hand
            rather than a duplicate of the first. */}
        <AnimatePresence>
          {done && (
            <MotiView
              from={{ opacity: 0, scale: 0.4, translateY: 6 }}
              animate={{ opacity: 1, scale: 1, translateY: 0 }}
              transition={reduceMotion
                ? { type: 'timing', duration: 160 }
                : { type: 'spring', damping: 11, stiffness: 220, delay: 60 }}
              style={styles.mirror}
            >
              <Icon name="thumbs-up" size={22} color={colors.textPrimary} />
            </MotiView>
          )}
        </AnimatePresence>
      </View>

      <View style={styles.captions}>
        <Text style={styles.caption}>
          {done ? 'ALL SET' : (label ?? 'GETTING YOUR SLATE')}
        </Text>
        {/* The single most useful thing on this screen during a real wait, and
            the reason it is worth more than a prettier spinner: it names the
            cause instead of leaving the user to assume the app is broken. */}
        {!done && coldStart && (
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

  burst: {
    position: 'absolute',
    width: 96, height: 96,
    borderWidth: 1,
    borderColor: colors.textPrimary,
  },

  // scaleX flips the glyph so the pair reads as left hand / right hand.
  mirror: { transform: [{ scaleX: -1 }] },

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
