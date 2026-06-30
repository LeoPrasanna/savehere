import { useEffect, useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, Platform, Animated, Easing, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Icon } from './Icon';
import { Reel, api } from '../services/api';
import * as haptics from '../services/haptics';
import { Pressable } from './Pressable';
import { HolographicShimmer } from './HolographicShimmer';
import { colors, spacing, radius, font, shadow, gradients, platformMeta, categoryFor, glass } from '../constants/theme';

interface ReelCardProps {
  reel: Reel;
  index?: number;
  onDelete?: (id: string) => void;
}

export function ReelCard({ reel, index = 0, onDelete }: ReelCardProps) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width > 600;
  const [cardW, setCardW] = useState(0);
  const [cardH, setCardH] = useState(0);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;
  const scale = useRef(new Animated.Value(0.9)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const neonPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const delay = Math.min(index, 8) * 60;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 400, delay, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, delay, useNativeDriver: true, speed: 12, bounciness: 7 }),
      Animated.spring(scale, { toValue: 1, delay, useNativeDriver: true, speed: 12, bounciness: 10 }),
    ]).start();
  }, []);

  // Subtle neon pulse on the border for pending cards
  useEffect(() => {
    if (reel.summary_status !== 'pending') return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(neonPulse, { toValue: 1.3, duration: 800, useNativeDriver: true }),
        Animated.timing(neonPulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [reel.summary_status]);

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
    haptics.tap();
    destroyAndRemove();
    api.deleteReel(reel.id).catch(() => {});
  };

  const platform = platformMeta[reel.platform] ?? platformMeta.unknown;
  const cat = categoryFor(reel.category);
  const firstBullet = reel.summary[0] ?? '';
  const isPending = reel.summary_status === 'pending';
  const cardGlow = isPending
    ? { borderColor: colors.accent + '80', shadowColor: colors.accent, shadowOpacity: 0.5, shadowRadius: 12 }
    : {};

  return (
    <Animated.View style={[styles.wrap, {
      opacity,
      transform: [
        { translateY },
        { scale },
        { rotate: rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '14deg'] }) },
      ],
    }]}>
      <Pressable
        style={[styles.card, cardGlow]}
        onPress={() => router.push(`/reel/${reel.id}`)}
        onLayout={(e) => {
          const { width: w, height: h } = e.nativeEvent.layout;
          setCardW(w);
          setCardH(h);
        }}
      >
        {/* Holographic shimmer overlay */}
        {isWide && cardW > 0 && cardH > 0 && (
          <HolographicShimmer width={cardW} height={cardH} color="rgba(255,255,255,0.06)" duration={3000} delay={index * 400} />
        )}

        {/* Thumbnail with futuristic platform indicator */}
        <View style={styles.thumbWrap}>
          <LinearGradient
            colors={platform.gradient as [string, string]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.cover}
          >
            <Image source={require('../assets/thumb-pattern.png')} style={styles.coverPattern} resizeMode="cover" />
            <View style={styles.platformBadge}>
              <Ionicons name={platform.icon as any} size={20} color="#FFF" />
            </View>
            {isPending && (
              <View style={styles.pendingBadge}>
                <ActivityIndicator size="small" color="#FFF" />
                <Text style={styles.pendingText}>AI working…</Text>
              </View>
            )}
          </LinearGradient>
          {/* Bottom edge glow */}
          <LinearGradient
            colors={['transparent', 'rgba(139,125,255,0.15)']}
            start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
            style={styles.bottomGlow}
          />
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

          {isPending ? (
            <View style={styles.summarizingRow}>
              <Animated.View style={{ transform: [{ scale: neonPulse }] }}>
                <ActivityIndicator size="small" color={colors.accent} />
              </Animated.View>
              <Text style={styles.summarizingText}>Summarizing…</Text>
            </View>
          ) : firstBullet.length > 0 ? (
            <Text style={styles.bullet} numberOfLines={3}>
              {firstBullet.length > 130 ? firstBullet.slice(0, 130) + '…' : firstBullet}
            </Text>
          ) : null}

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

      {/* Delete button */}
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
    backgroundColor: 'rgba(28,25,36,0.65)',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    overflow: 'hidden',
    ...shadow.sm,
  },
  thumbWrap: { position: 'relative', overflow: 'hidden' },
  cover: {
    width: '100%',
    height: 70,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  coverPattern: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.3 },
  bottomGlow: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0, height: 20,
  },
  platformBadge: {
    position: 'absolute',
    left: spacing.sm,
    bottom: spacing.sm,
    width: 28, height: 28,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
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
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pendingText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
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
  category: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'capitalize',
    letterSpacing: 0.3,
    flex: 1,
  },
  title: { color: colors.textPrimary, fontSize: font.sm, fontWeight: '700', lineHeight: 18 },
  bullet: { color: colors.textSecondary, fontSize: 11, lineHeight: 16 },
  summarizingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summarizingText: { color: colors.accent, fontSize: 11, fontWeight: '600' },
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
