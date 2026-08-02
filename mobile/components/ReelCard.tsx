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
 * A mosaic tile. THE IMAGE IS THE TILE — and nothing else is.
 *
 * Square-cornered, no card, no radius, no shadow, no chrome, and (after two
 * rounds of owner review) no text either. It went caption-block → scrim overlay
 * → bare picture, because each layer of metadata was the thing making a wall of
 * images read as a list of panels. Title, category and platform all live one tap
 * away on the detail screen, which has room for them.
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
      {/* Long-press deletes. The visible × is gone — the reference grid has no
          chrome on its tiles — but removing the affordance entirely would have
          been a silent functional loss, so it moved to a gesture. Delete also
          still lives on the detail screen, with a confirm. */}
      <Pressable
        style={styles.tap}
        onPress={() => router.push(`/reel/${reel.id}`)}
        onLongPress={handleDelete}
      >
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

        {/* ⚠️ NOTHING SITS ON THE PICTURE.
            No title, no category, no index, no scrim — the reference grid this
            is built against carries no text on its tiles at all, and every
            overlay added here was the thing making the wall look like a list
            instead of a wall. The title is one tap away on the detail screen.

            The ONLY exception is a still-processing save, which has no picture
            worth looking at yet and would otherwise be an unexplained grey
            rectangle. It says so, and stops saying so the moment it lands. */}
        {isPending && (
          <View style={styles.statusStrip}>
            <ActivityIndicator size="small" color={onImage.primary} />
            <Text style={styles.meta}>READING</Text>
          </View>
        )}
        {failed && (
          <View style={styles.statusStrip}>
            <Text style={styles.meta}>NO TEXT</Text>
          </View>
        )}
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

  // The one thing allowed on a tile, and only while it is still processing.
  statusStrip: {
    position: 'absolute',
    left: spacing.sm, right: spacing.sm, bottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  // ⚠️ Fixed light tones, not `colors.*` — this sits on a photograph, and the
  // photograph does not invert between light and dark mode.
  meta: {
    color: onImage.primary,
    fontFamily: typeface.label,
    fontSize: font.xs,
    letterSpacing: tracking.label,
  },
}));
