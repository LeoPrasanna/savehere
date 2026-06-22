import { Platform } from 'react-native';

/**
 * SaveHere design system.
 * Dark, energetic, premium. Violet primary with vibrant gradient accents.
 */

export const colors = {
  // Surfaces — warm near-blacks with a hint of violet feel more premium than pure #000
  background: '#0B0A0F',
  surface: '#15131C',
  card: '#1C1924',
  cardElevated: '#241F2E',
  border: '#2E2A38',
  borderLight: '#3A3548',

  // Primary accent (violet)
  accent: '#8B7DFF',
  accentDark: '#6C5CE7',
  accentLight: '#B6AEFF',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#9A93A8',
  textTertiary: '#615B70',

  // Tags
  tagBg: '#241F2E',
  tagText: '#B6AEFF',

  // Status
  danger: '#FF5C7A',
  success: '#3DD68C',
  warning: '#FFB84D',

  // Overlay for image scrims
  scrim: 'rgba(11,10,15,0.85)',
};

/** Gradient stop pairs — feed straight into <LinearGradient colors={...} /> */
export const gradients = {
  primary: ['#8B7DFF', '#6C5CE7'] as const,      // violet
  vibrant: ['#FF6B9D', '#C44EFF'] as const,      // pink → purple (the "pop")
  sunset: ['#FF8A5B', '#FF6B9D'] as const,       // orange → pink
  cool: ['#5BC0FF', '#8B7DFF'] as const,         // cyan → violet
  success: ['#3DD68C', '#2BB673'] as const,
  surface: ['#1C1924', '#15131C'] as const,      // subtle card depth
  scrim: ['transparent', 'rgba(11,10,15,0.0)', 'rgba(11,10,15,0.9)'] as const,
};

/** Per-platform brand colors for badges / accents */
export const platformMeta: Record<string, { color: string; gradient: readonly [string, string]; icon: string; label: string }> = {
  youtube: { color: '#FF0033', gradient: ['#FF4E50', '#FF0033'], icon: 'logo-youtube', label: 'YouTube' },
  instagram: { color: '#E1306C', gradient: ['#F77737', '#C13584'], icon: 'logo-instagram', label: 'Instagram' },
  tiktok: { color: '#25F4EE', gradient: ['#25F4EE', '#FE2C55'], icon: 'logo-tiktok', label: 'TikTok' },
  linkedin: { color: '#0A66C2', gradient: ['#2A8FE0', '#0A66C2'], icon: 'logo-linkedin', label: 'LinkedIn' },
  facebook: { color: '#1877F2', gradient: ['#3B82F6', '#1877F2'], icon: 'logo-facebook', label: 'Facebook' },
  unknown: { color: '#8B7DFF', gradient: ['#8B7DFF', '#6C5CE7'], icon: 'globe-outline', label: 'Web' },
};

/** Category visual identity — emoji + tint for chips and cards */
export const categoryMeta: Record<string, { icon: string; color: string }> = {
  all: { icon: 'all', color: '#8B7DFF' },
  fitness: { icon: 'fitness', color: '#FF6B9D' },
  cooking: { icon: 'cooking', color: '#FFB84D' },
  tech: { icon: 'tech', color: '#5BC0FF' },
  motivation: { icon: 'motivation', color: '#FF8A5B' },
  education: { icon: 'education', color: '#3DD68C' },
  entertainment: { icon: 'entertainment', color: '#C44EFF' },
  fashion: { icon: 'fashion', color: '#FF8FB1' },
  travel: { icon: 'travel', color: '#42C9FF' },
  business: { icon: 'business', color: '#B6AEFF' },
  news: { icon: 'news', color: '#9AA0AA' },
  health: { icon: 'health', color: '#4ADE80' },
  finance: { icon: 'finance', color: '#F4C430' },
  general: { icon: 'general', color: '#9A93A8' },
  other: { icon: 'other', color: '#9A93A8' },
};

export const categoryFor = (c?: string | null) =>
  categoryMeta[(c || 'other').toLowerCase()] ?? categoryMeta.other;

/** The categories a reel can be assigned to (auto or user-picked). Excludes the
 *  'all' filter pseudo-category. Keep in sync with backend ALLOWED_CATEGORIES. */
export const CATEGORY_OPTIONS = [
  'fitness', 'cooking', 'tech', 'motivation', 'education', 'entertainment',
  'fashion', 'travel', 'business', 'news', 'health', 'finance', 'other',
] as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  full: 999,
};

export const font = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 18,
  xl: 24,
  xxl: 32,
  display: 40,
};

/** Reusable elevation presets (iOS shadow + Android elevation) */
export const shadow = {
  sm: Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 6 },
    default: { elevation: 3 },
  }),
  md: Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 14 },
    default: { elevation: 8 },
  }),
  glow: Platform.select({
    ios: { shadowColor: colors.accent, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.55, shadowRadius: 18 },
    default: { elevation: 12 },
  }),
} as const;
