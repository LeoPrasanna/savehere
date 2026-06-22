import { useEffect, useRef } from 'react';
import { View, Text, Image, StyleSheet, Platform, Animated, Easing } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Icon } from './Icon';
import { Reel, api } from '../services/api';
import { Pressable } from './Pressable';
import { colors, spacing, radius, font, shadow, gradients, platformMeta, categoryFor } from '../constants/theme';

interface ReelCardProps {
  reel: Reel;
  index?: number;
  onDelete?: (id: string) => void;
}

export function ReelCard({ reel, index = 0, onDelete }: ReelCardProps) {
  const router = useRouter();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;
  const scale = useRef(new Animated.Value(0.9)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const delay = Math.min(index, 8) * 60; // cap stagger so late cards aren't slow
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 350, delay, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, delay, useNativeDriver: true, speed: 12, bounciness: 7 }),
      Animated.spring(scale, { toValue: 1, delay, useNativeDriver: true, speed: 12, bounciness: 10 }), // pop in
    ]).start();
  }, []);

  // Destroy animation: pop bigger, then spin + shrink away while fading out.
  const destroyAndRemove = () => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 320, useNativeDriver: true }),
      Animated.timing(rotate, { toValue: 1, duration: 320, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.12, duration: 110, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0, duration: 230, easing: Easing.in(Easing.back(2)), useNativeDriver: true }),
      ]),
    ]).start(() => onDelete?.(reel.id));
  };

  const handleDelete = async () => {
    const confirmed = Platform.OS === 'web' ? window.confirm('Remove this saved reel?') : true;
    if (!confirmed) return;
    destroyAndRemove();                        // animate out immediately
    api.deleteReel(reel.id).catch(() => {});   // delete on the backend in the background
  };

  const platform = platformMeta[reel.platform] ?? platformMeta.unknown;
  const cat = categoryFor(reel.category);
  const firstBullet = reel.summary[0] ?? '';

  return (
    <Animated.View style={[styles.wrap, {
      opacity,
      transform: [
        { translateY },
        { scale },
        { rotate: rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '14deg'] }) },
      ],
    }]}>
      <Pressable style={styles.card} onPress={() => router.push(`/reel/${reel.id}`)}>
        {/* Thumbnail with scrim + floating platform chip */}
        {/* Compact brand banner (real thumbnail shows on detail) */}
        <View style={styles.thumbWrap}>
          <LinearGradient
            colors={gradients.primary}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.cover}
          >
            <Image source={require('../assets/thumb-pattern.png')} style={styles.coverPattern} resizeMode="cover" />
            <Ionicons name={platform.icon as any} size={22} color="rgba(255,255,255,0.95)" />
          </LinearGradient>
        </View>

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.metaRow}>
            <Icon name={cat.icon} size={12} color={cat.color} />
            {reel.category ? (
              <Text style={[styles.category, { color: cat.color }]} numberOfLines={1}>
                {reel.category}
              </Text>
            ) : null}
          </View>

          <Text style={styles.title} numberOfLines={2}>
            {reel.title || 'Untitled'}
          </Text>

          {firstBullet.length > 0 && (
            <Text style={styles.bullet} numberOfLines={3}>
              {firstBullet.length > 130 ? firstBullet.slice(0, 130) + '…' : firstBullet}
            </Text>
          )}

          {reel.tags.length > 0 && (
            <View style={styles.tags}>
              {reel.tags.slice(0, 2).map(tag => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText} numberOfLines={1}>#{tag}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </Pressable>

      {/* Delete — sibling on top of the card so the tap never bubbles to navigation */}
      <Pressable style={styles.deleteBtn} onPress={handleDelete} hitSlop={8} scaleTo={0.85}>
        <Icon name="close" size={13} color="#FFF" />
      </Pressable>
    </Animated.View>
  );
}

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
  thumbWrap: { position: 'relative', overflow: 'hidden' },
  cover: {
    width: '100%',
    height: 66,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  coverPattern: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.35 },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 50 },
  platformChip: {
    position: 'absolute',
    left: spacing.sm,
    bottom: spacing.sm,
    width: 24,
    height: 24,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
  },
  deleteBtn: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 24,
    height: 24,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    elevation: 10,
  },
  content: { padding: spacing.sm, gap: 5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  catEmoji: { fontSize: 12 },
  category: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'capitalize',
    letterSpacing: 0.3,
    flex: 1,
  },
  title: { color: colors.textPrimary, fontSize: font.sm, fontWeight: '700', lineHeight: 18 },
  bullet: { color: colors.textSecondary, fontSize: 11, lineHeight: 16 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  tag: {
    backgroundColor: colors.tagBg,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: '100%',
  },
  tagText: { color: colors.tagText, fontSize: 10, fontWeight: '600' },
});
