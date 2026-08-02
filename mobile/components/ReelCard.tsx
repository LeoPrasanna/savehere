import { memo, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform, Animated, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from './Icon';
import { Reel, api, thumbCandidates } from '../services/api';
import * as haptics from '../services/haptics';
import { Pressable } from './Pressable';
import { Label } from './kit';
import {
  colors, spacing, font, tracking, typeface, platformMeta, gradients, onImage, motion, themed,
} from '../constants/theme';

interface ReelCardProps {
  reel: Reel;
  index?: number;
  onDelete?: (id: string) => void;
  /** Height/width of the image well. Supplied by the masonry grid so tiles
   *  stagger; defaults to 3:4 portrait for the fixed-row grids. */
  aspect?: number;
}

/**
 * The intrinsic ratio of a thumbnail is unknown until the image loads, and
 * resizing the tile at that point reflows every tile below it — so the mosaic
 * picks a stable ratio up front, hashed from the reel id. Deterministic: a tile
 * never changes height between renders or sessions.
 *
 * ⚠️ EVERY RATIO IS PORTRAIT. Reels are vertical, and an earlier version handed
 * YouTube and LinkedIn *landscape* wells on the theory that they serve landscape
 * thumbnails. That put two different tile shapes in one grid, which is what made
 * the wall look inconsistent — and it framed YouTube's baked-in pillarbox bars
 * instead of cutting them. (The bars are now solved properly upstream, by
 * requesting `oardefault.jpg` — see `thumbCandidates` in services/api.ts.)
 */
const RATIOS = [3 / 4, 4 / 5, 2 / 3, 9 / 16];

export function aspectFor(reel: { id: string; platform?: string | null }): number {
  let h = 0;
  const s = reel.id || '';
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return RATIOS[h % RATIOS.length];
}

/**
 * A mosaic tile. THE IMAGE IS THE TILE — nothing sits below it.
 *
 * Square-cornered, no card, no radius, no shadow, no coloured chrome; the title
 * and category ride on a scrim over the bottom of the picture. The separate
 * caption block this replaced was eating ~40% of every tile and turned the wall
 * into a column of black panels instead of a wall of images.
 */
function ReelCardInner({ reel, index = 0, onDelete, aspect = 3 / 4 }: ReelCardProps) {
  const router = useRouter();
  // Walk the candidate list (see api.thumbCandidates): the un-letterboxed
  // YouTube frame first, the stored URL if that 404s, an empty frame if both
  // fail. `candidate` is an index into that list.
  const candidates = thumbCandidates(reel.thumbnail_url);
  const [candidate, setCandidate] = useState(0);
  const opacity = useRef(new Animated.Value(0)).current;
  const imgOpacity = useRef(new Animated.Value(0)).current;

  // A plain fade. The outgoing card slid up, scaled and rotated away on delete;
  // this direction's motion rule is "colour and opacity only, nothing
  // decorative", and a rotating rectangle on a contact sheet reads as a fault.
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: motion.micro,
      delay: Math.min(index, 8) * 25,
      useNativeDriver: true,
    }).start();
  }, []);

  const handleDelete = async () => {
    const confirmed = Platform.OS === 'web' ? window.confirm('Remove this save?') : true;
    if (!confirmed) return;
    haptics.tap();
    Animated.timing(opacity, {
      toValue: 0,
      duration: motion.micro,
      useNativeDriver: true,
    }).start(() => onDelete?.(reel.id));
    api.deleteReel(reel.id).catch(() => {});
  };

  const platform = platformMeta[reel.platform] ?? platformMeta.unknown;
  const isPending = reel.summary_status === 'pending';
  const failed = reel.summary_status === 'failed';
  const thumb = candidates[candidate];

  return (
    <Animated.View style={[styles.frame, { opacity, aspectRatio: aspect }]}>
      <Pressable style={styles.tap} onPress={() => router.push(`/reel/${reel.id}`)}>
        {thumb ? (
          <Animated.Image
            // Keyed on the candidate so a fallback actually remounts the image
            // rather than reusing the failed one's element.
            key={thumb}
            source={{ uri: thumb }}
            style={[styles.image, { opacity: imgOpacity }]}
            resizeMode="cover"
            onLoad={() => Animated.timing(imgOpacity, {
              toValue: 1, duration: motion.micro, useNativeDriver: true,
            }).start()}
            onError={() => setCandidate(c => c + 1)}
          />
        ) : (
          /* No thumbnail: an empty frame with its platform named, rather than
             a coloured tint standing in for a picture. */
          <View style={[styles.image, styles.imageEmpty]}>
            <Icon name={platform.icon === 'globe-outline' ? 'link' : 'play'} size={20} color={colors.textTertiary} />
          </View>
        )}

        {/* Scrim: the title sits ON the image now, so it has to stay readable
            over an unknown photograph. This keeps real gradient stops while
            every other gradient in the system is flat. */}
        <LinearGradient
          colors={gradients.scrim}
          start={{ x: 0, y: 0.3 }} end={{ x: 0, y: 1 }}
          style={[styles.scrim, { pointerEvents: 'none' }]}
        />

        <Text style={styles.overIndex}>{String(index + 1).padStart(2, '0')}</Text>

        {/* Everything the tile has to say, over the image. The separate caption
            block this replaces was taking ~40% of the tile and turned the wall
            into a list of black panels; the image is the tile now. */}
        <View style={styles.overlay}>
          <View style={styles.statusRow}>
            {isPending && (
              <>
                <ActivityIndicator size="small" color={onImage.primary} />
                <Text style={styles.meta}>READING</Text>
              </>
            )}
            {failed && <Text style={styles.meta}>NO TEXT</Text>}
          </View>
          <Text style={styles.title} numberOfLines={2}>
            {reel.title || (isPending ? 'Saving…' : 'Untitled')}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {(reel.category || 'other').toUpperCase()}
          </Text>
        </View>
      </Pressable>

      <Pressable style={styles.delete} onPress={handleDelete} hitSlop={10} accessibilityLabel="Remove save">
        <Icon name="close" size={11} color={onImage.muted} />
      </Pressable>
    </Animated.View>
  );
}

// Memoized: infinite-scroll appends re-render only the new cards, not the whole
// grid. Compare the fields the card actually displays.
export const ReelCard = memo(ReelCardInner, (prev, next) =>
  prev.reel.id === next.reel.id &&
  prev.index === next.index &&
  prev.aspect === next.aspect &&
  prev.reel.title === next.reel.title &&
  prev.reel.summary_status === next.reel.summary_status &&
  prev.reel.category === next.reel.category &&
  prev.reel.thumbnail_url === next.reel.thumbnail_url &&
  prev.reel.tags[0] === next.reel.tags[0]
);

const styles = themed(() => StyleSheet.create({
  // The tile IS the image. aspectRatio comes from the grid (see aspectFor), so
  // the frame has no intrinsic height of its own and nothing below the picture.
  frame: {
    flex: 1,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  tap: { flex: 1 },

  image: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  imageEmpty: { alignItems: 'center', justifyContent: 'center' },
  // Taller than the old 72px strip because the title lives in here now.
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '58%' },

  overIndex: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    color: onImage.muted,
    fontFamily: typeface.label,
    fontSize: font.xs,
    letterSpacing: tracking.label,
    fontVariant: ['tabular-nums'],
  },

  overlay: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    bottom: spacing.sm,
    gap: 3,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  // ⚠️ Fixed light tones, not `colors.*` — this text sits on a photograph, and
  // the photograph does not invert between light and dark mode.
  title: {
    color: onImage.primary,
    fontFamily: typeface.display,
    fontSize: font.sm,
    lineHeight: 16,
    letterSpacing: -0.2,
  },
  meta: {
    color: onImage.muted,
    fontFamily: typeface.label,
    fontSize: font.xs,
    letterSpacing: tracking.label,
  },

  // Quieter than it was: a white X on every tile read as the loudest mark on
  // the wall. Muted, and it sits on the scrim rather than the picture.
  delete: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
}));
