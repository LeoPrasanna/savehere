import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from './Icon';
import { colors, spacing, font, tracking, typeface, themed, getColorScheme } from '../constants/theme';

/**
 * A mock reel card for the signed-out welcome wall.
 *
 * ⚠️ CONTAINS NO BITMAP, ANYWHERE — and that is the point, not a limitation.
 * An earlier pass filled these with the user's cached thumbnails; the owner
 * raised the copyright question and the resolution was to have no imagery at
 * all rather than reason about which imagery is safe. Everything below is drawn
 * from Views and gradients, so there is nothing to licence, nothing to ship,
 * and nothing that belongs to anyone else.
 *
 * ⚠️ ASKED FOR AS "AI-created reel content". No image-generation tool exists in
 * this environment, so photographic frames could not be authored. These are the
 * honest alternative: procedurally composed SCENES — a portrait, a horizon, a
 * top-down cup, a product on a plinth, a skyline, a title card — built from the
 * palette's own tones. At tile size, behind a scrim and drifting, they read as a
 * wall of monochrome stills rather than a grid of grey rectangles.
 *
 * If real photography is wanted later, the only safe route is licensed assets
 * the owner supplies (a paid stock licence permitting app embedding, or shot
 * in-house). Wiring those in is a small change: give `Scene` an image branch and
 * drop the files in `assets/`. Do NOT swap in scraped or hotlinked images.
 */

/** Composition kinds. One per seed, so the wall never repeats a neighbour. */
type Kind = 'portrait' | 'horizon' | 'topdown' | 'product' | 'skyline' | 'title';

const KINDS: Kind[] = ['portrait', 'horizon', 'topdown', 'product', 'skyline', 'title'];

/**
 * Monochrome ramp. Every tone is the ink colour at some opacity over the card,
 * so the whole scene vocabulary inverts with the colour scheme instead of being
 * hardcoded greys that would glow in light mode.
 */
function alpha(a: number): string {
  return getColorScheme() === 'dark'
    ? `rgba(248,248,248,${a})`
    : `rgba(0,0,0,${a})`;
}

function Scene({ kind, seed }: { kind: Kind; seed: number }) {
  // Small deterministic jitter so two tiles of the same kind aren't identical.
  const j = (seed * 37) % 100 / 100;

  switch (kind) {
    // A figure against a lit ground — the shape language of a person-to-camera
    // reel without depicting a person.
    case 'portrait':
      return (
        <>
          <LinearGradient
            colors={[alpha(0.16), alpha(0.04)]}
            style={styles.fill}
          />
          <View style={[styles.pHead, { left: `${28 + j * 18}%` }]} />
          <View style={[styles.pBody, { left: `${16 + j * 18}%` }]} />
        </>
      );

    // Sky, horizon, sun. The travel/landscape frame.
    case 'horizon':
      return (
        <>
          <LinearGradient
            colors={[alpha(0.22), alpha(0.06), alpha(0.13)]}
            locations={[0, 0.58, 0.6]}
            style={styles.fill}
          />
          <View style={[styles.hSun, { left: `${20 + j * 50}%` }]} />
          <View style={styles.hLine} />
          <View style={[styles.hRidge, { left: `${-10 + j * 20}%` }]} />
        </>
      );

    // Concentric rings on a bright ground — a cup or bowl shot from above.
    case 'topdown':
      return (
        <>
          <View style={[styles.fill, { backgroundColor: alpha(0.2) }]} />
          <View style={styles.tOuter} />
          <View style={styles.tInner} />
          <View style={[styles.tSwirl, { transform: [{ rotate: `${j * 180}deg` }] }]} />
        </>
      );

    // An object on a plinth with a soft contact shadow — the product frame.
    case 'product':
      return (
        <>
          <LinearGradient colors={[alpha(0.22), alpha(0.1)]} style={styles.fill} />
          <View style={styles.prShadow} />
          <View style={[styles.prBody, { transform: [{ rotate: `${-8 + j * 16}deg` }] }]} />
          <View style={styles.prChip} />
        </>
      );

    // Stacked verticals along the base — architecture / street.
    case 'skyline':
      return (
        <>
          <LinearGradient colors={[alpha(0.05), alpha(0.18)]} style={styles.fill} />
          <View style={styles.skRow}>
            {[0.5, 0.8, 0.35, 0.95, 0.62, 0.42].map((h, i) => (
              <View
                key={i}
                style={[styles.skBar, { height: `${(h * (0.7 + j * 0.5)) * 100}%` }]}
              />
            ))}
          </View>
        </>
      );

    // A type-led frame — the "text post" reel, and the one place the wall shows
    // a word. Deliberately abstract bars rather than readable copy.
    case 'title':
    default:
      return (
        <>
          <View style={[styles.fill, { backgroundColor: alpha(0.18) }]} />
          <View style={styles.tlStack}>
            <View style={[styles.tlBar, { width: '78%' }]} />
            <View style={[styles.tlBar, { width: '54%' }]} />
            <View style={[styles.tlBar, { width: '66%' }]} />
            <View style={[styles.tlRule, { width: '34%' }]} />
          </View>
        </>
      );
  }
}

/**
 * The card: player chrome around a scene.
 *
 * The chrome is what makes it read as a reel rather than a photo — a label, a
 * part-played scrubber, an action row. The action glyph is a BOOKMARK rather
 * than the usual heart: this is a saving app, and save is the verb it cares
 * about. It is the one detail on the card that says whose product this is.
 */
export function MockReel({ seed }: { seed: number }) {
  const kind = KINDS[seed % KINDS.length];
  const progress = 18 + ((seed * 37) % 64);

  return (
    <View style={styles.reel}>
      <View style={styles.reelHead}>
        <Text style={styles.reelLabel}>REEL</Text>
        <View style={styles.reelDots}>
          <View style={styles.reelDot} />
          <View style={styles.reelDot} />
          <View style={styles.reelDot} />
        </View>
      </View>

      <View style={styles.reelWell}>
        <Scene kind={kind} seed={seed} />
        {/* Play affordance, over the scene. */}
        <View style={styles.reelPlay} />
      </View>

      <View style={styles.reelFoot}>
        <View style={styles.scrubTrack}>
          <View style={[styles.scrubFill, { width: `${progress}%` }]} />
          <View style={[styles.scrubHead, { left: `${progress}%` }]} />
        </View>
        <View style={styles.reelIcons}>
          <Icon name="bookmark" size={9} color={colors.textTertiary} />
          <Icon name="ask" size={9} color={colors.textTertiary} />
          <Icon name="send" size={9} color={colors.textTertiary} />
        </View>
      </View>
    </View>
  );
}

/** Height of one card. Exported so the drift loop knows its travel distance
 *  without measuring anything on screen. */
export const MOCK_REEL_H = 196;

const styles = themed(() => StyleSheet.create({
  reel: {
    width: '100%',
    height: MOCK_REEL_H,
    borderWidth: 0.5,
    borderColor: colors.ghostLine,
    backgroundColor: colors.card,
    padding: spacing.sm,
    justifyContent: 'space-between',
  },
  reelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reelLabel: {
    color: colors.textTertiary,
    fontFamily: typeface.label,
    fontSize: 8,
    letterSpacing: tracking.labelWide,
  },
  reelDots: { flexDirection: 'row', gap: 2 },
  reelDot: { width: 2, height: 2, backgroundColor: colors.textTertiary },

  reelWell: {
    flex: 1,
    marginVertical: spacing.sm,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reelPlay: {
    width: 0, height: 0,
    borderTopWidth: 5, borderBottomWidth: 5, borderLeftWidth: 9,
    borderTopColor: 'transparent', borderBottomColor: 'transparent',
    borderLeftColor: colors.background,
    opacity: 0.85,
  },

  reelFoot: { gap: spacing.sm },
  scrubTrack: { height: 1.5, backgroundColor: colors.ghostLine },
  scrubFill: { height: '100%', backgroundColor: colors.textSecondary },
  scrubHead: {
    position: 'absolute', top: -1.5, width: 4.5, height: 4.5,
    marginLeft: -2, backgroundColor: colors.textSecondary,
  },
  reelIcons: { flexDirection: 'row', gap: spacing.sm },

  // ── Scene primitives ──
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },

  pHead: { position: 'absolute', top: '18%', width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.55)' },
  pBody: { position: 'absolute', top: '46%', width: 46, height: '54%', borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: 'rgba(0,0,0,0.55)' },

  hSun: { position: 'absolute', top: '20%', width: 16, height: 16, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.5)' },
  hLine: { position: 'absolute', top: '58%', left: 0, right: 0, height: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  hRidge: { position: 'absolute', top: '50%', width: '80%', height: 26, borderTopLeftRadius: 40, borderTopRightRadius: 60, backgroundColor: 'rgba(0,0,0,0.4)' },

  tOuter: { width: 46, height: 46, borderRadius: 23, borderWidth: 2, borderColor: 'rgba(0,0,0,0.4)' },
  tInner: { position: 'absolute', width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.18)' },
  tSwirl: { position: 'absolute', width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.3)', borderRightColor: 'transparent' },

  prShadow: { position: 'absolute', bottom: '22%', width: '52%', height: 5, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.28)' },
  prBody: { width: 34, height: 40, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.5)' },
  prChip: { position: 'absolute', top: '30%', right: '22%', width: 12, height: 12, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.35)' },

  skRow: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '70%', flexDirection: 'row', alignItems: 'flex-end', gap: 3, paddingHorizontal: 4 },
  skBar: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },

  tlStack: { width: '74%', gap: 5 },
  tlBar: { height: 5, backgroundColor: 'rgba(0,0,0,0.45)' },
  tlRule: { height: 1, marginTop: 3, backgroundColor: 'rgba(0,0,0,0.3)' },
}));
