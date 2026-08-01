import { memo, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform, Animated, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from './Icon';
import { Reel, api, thumbUrl } from '../services/api';
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
}

/**
 * A contact-sheet frame.
 *
 * The image is full-bleed and square-cornered, seamed to its neighbours by the
 * 1px ghost line — there is no card, no radius, no shadow and no coloured
 * chrome. Everything that used to be carried by colour (platform, category,
 * pending state) is now a small tracked uppercase word.
 *
 * Layout follows `entire studios`' product card: image on top, caption block
 * beneath. Julia Krantz overlays its labels directly on the photograph, which
 * works for two-letter project codes and fails for a real two-line video title
 * over an unknown thumbnail — so only the short, scrim-backed metadata sits on
 * the image.
 */
function ReelCardInner({ reel, index = 0, onDelete }: ReelCardProps) {
  const router = useRouter();
  // The real thumbnail is the frame's content; fall back to an empty frame only
  // when extraction couldn't get one (or the image itself fails to load).
  const [thumbFailed, setThumbFailed] = useState(false);
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
  const thumb = !thumbFailed ? thumbUrl(reel.thumbnail_url) : undefined;

  return (
    <Animated.View style={[styles.frame, { opacity }]}>
      <Pressable style={styles.tap} onPress={() => router.push(`/reel/${reel.id}`)}>
        <View style={styles.imageWrap}>
          {thumb ? (
            <Animated.Image
              source={{ uri: thumb }}
              style={[styles.image, { opacity: imgOpacity }]}
              resizeMode="cover"
              onLoad={() => Animated.timing(imgOpacity, {
                toValue: 1, duration: motion.micro, useNativeDriver: true,
              }).start()}
              onError={() => setThumbFailed(true)}
            />
          ) : (
            /* No thumbnail: an empty frame with its platform named, rather than
               a coloured tint standing in for a picture. */
            <View style={[styles.image, styles.imageEmpty]}>
              <Icon name={platform.icon === 'globe-outline' ? 'link' : 'play'} size={20} color={colors.textTertiary} />
            </View>
          )}

          {/* Scrim: overlay metadata has to stay readable over an unknown
              photograph, so this keeps real gradient stops while every other
              gradient in the system is flat. */}
          <LinearGradient
            colors={gradients.scrim}
            start={{ x: 0, y: 0.45 }} end={{ x: 0, y: 1 }}
            style={[styles.scrim, { pointerEvents: 'none' }]}
          />

          <Text style={styles.overIndex}>{String(index + 1).padStart(2, '0')}</Text>

          <View style={styles.overFoot}>
            <Text style={styles.overPlatform}>{platform.label.toUpperCase()}</Text>
            {isPending && (
              <View style={styles.pending}>
                <ActivityIndicator size="small" color={onImage.primary} />
                <Text style={styles.overPlatform}>READING</Text>
              </View>
            )}
            {failed && <Text style={styles.overPlatform}>NO TEXT</Text>}
          </View>
        </View>

        {/* Caption block */}
        <View style={styles.caption}>
          <Text style={styles.title} numberOfLines={2}>
            {reel.title || (isPending ? 'Saving…' : 'Untitled')}
          </Text>
          <View style={styles.metaRow}>
            <Label>{reel.category || 'other'}</Label>
            {reel.tags.length > 0 && (
              <Label style={styles.tag} numberOfLines={1}>{reel.tags[0]}</Label>
            )}
          </View>
        </View>
      </Pressable>

      <Pressable style={styles.delete} onPress={handleDelete} hitSlop={10}>
        <Icon name="close" size={13} color={onImage.primary} />
      </Pressable>
    </Animated.View>
  );
}

// Memoized: infinite-scroll appends re-render only the new cards, not the whole
// grid. Compare the fields the card actually displays.
export const ReelCard = memo(ReelCardInner, (prev, next) =>
  prev.reel.id === next.reel.id &&
  prev.index === next.index &&
  prev.reel.title === next.reel.title &&
  prev.reel.summary_status === next.reel.summary_status &&
  prev.reel.category === next.reel.category &&
  prev.reel.thumbnail_url === next.reel.thumbnail_url &&
  prev.reel.tags[0] === next.reel.tags[0]
);

const styles = themed(() => StyleSheet.create({
  // No margin: frames sit flush and are separated by their own hairline, the
  // way a contact sheet's cells are. The grid supplies no gutter either.
  frame: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: colors.ghostLine,
  },
  tap: { flex: 1 },

  imageWrap: { position: 'relative', backgroundColor: colors.card },
  // Portrait. Reels are vertical; the outgoing 16:10 landscape crop cut the top
  // and bottom off almost every thumbnail the app actually stores.
  image: { width: '100%', aspectRatio: 3 / 4 },
  imageEmpty: { alignItems: 'center', justifyContent: 'center' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 72 },

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
  overFoot: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    bottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  overPlatform: {
    color: onImage.primary,
    fontFamily: typeface.label,
    fontSize: font.xs,
    letterSpacing: tracking.labelWide,
  },
  pending: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },

  caption: { padding: spacing.sm, gap: spacing.xs, flex: 1 },
  title: {
    color: colors.textPrimary,
    fontFamily: typeface.display,
    fontSize: font.sm,
    lineHeight: 17,
    letterSpacing: -0.2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: 'auto',
    paddingTop: spacing.xs,
  },
  tag: { flex: 1, textAlign: 'right' },

  delete: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
}));
