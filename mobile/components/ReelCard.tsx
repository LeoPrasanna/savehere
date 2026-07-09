import { memo, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform, Animated, Easing, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Icon } from './Icon';
import { Reel, api, thumbUrl } from '../services/api';
import * as haptics from '../services/haptics';
import { Pressable } from './Pressable';
import { colors, spacing, radius, font, shadow, typeface, platformMeta, categoryFor } from '../constants/theme';

interface ReelCardProps {
  reel: Reel;
  index?: number;
  onDelete?: (id: string) => void;
}

function ReelCardInner({ reel, index = 0, onDelete }: ReelCardProps) {
  const router = useRouter();
  // The real thumbnail is the card's hero; fall back to a platform-tinted cover
  // only when extraction couldn't get one (or the image itself fails to load).
  const [thumbFailed, setThumbFailed] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const imgOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const delay = Math.min(index, 8) * 45;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 320, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 320, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  const destroyAndRemove = () => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 280, useNativeDriver: true }),
      Animated.timing(rotate, { toValue: 1, duration: 280, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 0.6, duration: 280, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start(() => onDelete?.(reel.id));
  };

  const handleDelete = async () => {
    const confirmed = Platform.OS === 'web' ? window.confirm('Remove this saved reel?') : true;
    if (!confirmed) return;
    haptics.tap();
    destroyAndRemove();
    api.deleteReel(reel.id).catch(() => {});
  };

  const platform = platformMeta[reel.platform] ?? platformMeta.unknown;
  const cat = categoryFor(reel.category);
  const firstBullet = reel.summary[0] ?? '';
  const isPending = reel.summary_status === 'pending';
  const thumb = !thumbFailed ? thumbUrl(reel.thumbnail_url) : undefined;

  return (
    <Animated.View style={[styles.wrap, {
      opacity,
      transform: [
        { translateY },
        { scale },
        { rotate: rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '8deg'] }) },
      ],
    }]}>
      <Pressable style={styles.card} onPress={() => router.push(`/reel/${reel.id}`)}>
        {/* Cover — the actual reel thumbnail, or a quiet platform-tinted fallback */}
        <View style={styles.thumbWrap}>
          {thumb ? (
            <Animated.Image
              source={{ uri: thumb }}
              style={[styles.cover, { opacity: imgOpacity }]}
              resizeMode="cover"
              onLoad={() => Animated.timing(imgOpacity, { toValue: 1, duration: 220, useNativeDriver: true }).start()}
              onError={() => setThumbFailed(true)}
            />
          ) : (
            <LinearGradient
              colors={platform.gradient as [string, string]}
              start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
              style={[styles.cover, styles.coverFallback]}
            >
              <Ionicons name={platform.icon as any} size={30} color={platform.color + 'B3'} />
            </LinearGradient>
          )}
          {/* Bottom scrim keeps the platform badge legible over any image */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.55)']}
            start={{ x: 0, y: 0.4 }} end={{ x: 0, y: 1 }}
            style={styles.coverScrim}
            pointerEvents="none"
          />
          <View style={styles.platformBadge}>
            <Ionicons name={platform.icon as any} size={13} color="#FFF" />
          </View>
          {isPending && (
            <View style={styles.pendingBadge}>
              <ActivityIndicator size="small" color="#FFF" />
              <Text style={styles.pendingText}>AI</Text>
            </View>
          )}
        </View>

        {/* Content */}
        <View style={styles.content}>
          <Text style={styles.title} numberOfLines={2}>
            {reel.title || 'Untitled'}
          </Text>

          {isPending ? (
            <Text style={styles.summarizingText}>Summarizing…</Text>
          ) : firstBullet.length > 0 ? (
            <Text style={styles.bullet} numberOfLines={2}>
              {firstBullet}
            </Text>
          ) : null}

          <View style={styles.metaRow}>
            <View style={[styles.catDot, { backgroundColor: cat.color }]} />
            <Text style={styles.category} numberOfLines={1}>
              {reel.category || 'other'}
            </Text>
            {reel.tags.length > 0 && (
              <Text style={styles.tagText} numberOfLines={1}>#{reel.tags[0]}</Text>
            )}
          </View>
        </View>
      </Pressable>

      {/* Delete button */}
      <Pressable style={styles.deleteBtn} onPress={handleDelete} hitSlop={8} scaleTo={0.85}>
        <Icon name="close" size={12} color="rgba(255,255,255,0.9)" />
      </Pressable>
    </Animated.View>
  );
}

// Memoized: infinite-scroll appends re-render only the new cards, not the whole
// grid. Compare the fields the card actually displays.
export const ReelCard = memo(ReelCardInner, (prev, next) =>
  prev.reel.id === next.reel.id &&
  prev.reel.title === next.reel.title &&
  prev.reel.summary_status === next.reel.summary_status &&
  prev.reel.category === next.reel.category &&
  prev.reel.thumbnail_url === next.reel.thumbnail_url &&
  prev.reel.summary[0] === next.reel.summary[0] &&
  prev.reel.tags[0] === next.reel.tags[0]
);

const styles = StyleSheet.create({
  wrap: { flex: 1, marginBottom: spacing.sm },
  card: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.sm,
  },
  thumbWrap: { position: 'relative', overflow: 'hidden', backgroundColor: colors.surface },
  cover: {
    width: '100%',
    aspectRatio: 16 / 10,
  },
  coverFallback: { alignItems: 'center', justifyContent: 'center' },
  coverScrim: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0, height: 44,
  },
  platformBadge: {
    position: 'absolute',
    left: spacing.sm,
    bottom: spacing.sm,
    width: 24, height: 24,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingBadge: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: radius.full,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  pendingText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  deleteBtn: {
    position: 'absolute',
    top: spacing.xs + 2,
    right: spacing.xs + 2,
    width: 22,
    height: 22,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    elevation: 10,
  },
  content: { padding: spacing.sm + 2, gap: 4, flex: 1 },
  title: { color: colors.textPrimary, fontFamily: typeface.displayMedium, fontSize: font.sm, fontWeight: '600', lineHeight: 18, letterSpacing: -0.1 },
  bullet: { color: colors.textSecondary, fontSize: font.xs, lineHeight: 16 },
  summarizingText: { color: colors.accent, fontSize: font.xs, fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 'auto', paddingTop: 4 },
  catDot: { width: 6, height: 6, borderRadius: 3 },
  category: {
    color: colors.textTertiary,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'capitalize',
    letterSpacing: 0.2,
  },
  tagText: { color: colors.textTertiary, fontSize: 10, flex: 1, textAlign: 'right' },
});
