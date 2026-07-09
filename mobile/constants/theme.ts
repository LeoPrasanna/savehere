import { Platform } from 'react-native';

/**
 * SaveHere design system — "calm premium dark".
 *
 * One confident accent (iris violet, matching the app icon), near-black warm
 * surfaces, hairline borders, an iOS-leaning type scale, and restrained motion.
 * Color is reserved for meaning (platform, category, status) — the chrome stays
 * quiet so the user's saved content is the loudest thing on screen.
 *
 * NOTE: token names are a stable API — screens import these by name. Add new
 * tokens freely; rename/remove only with a sweep of all usages.
 */

export const colors = {
  // Surfaces — warm near-blacks. Each step is one perceptible notch brighter.
  background: '#0A0A0D',
  surface: '#121118',
  card: '#17151D',
  cardElevated: '#1E1B25',
  border: '#242130',        // hairline on card edges
  borderLight: '#2E2A3B',   // slightly stronger, for inputs/dividers

  // Primary accent (iris violet — the app icon's hue). Use for primary actions,
  // active states and links; never as large background washes.
  accent: '#8B7DFF',
  accentDark: '#6C5CE7',
  accentLight: '#A99EFF',

  // Text — soft off-white reads calmer than pure #FFF on OLED black.
  textPrimary: '#F4F2F8',
  textSecondary: '#A29BB3',
  textTertiary: '#6B6478',

  // Tags
  tagBg: '#211E2B',
  tagText: '#B0A6E8',

  // Status
  danger: '#FF5C7A',
  success: '#3DD68C',
  warning: '#FFB84D',

  // Legacy accent aliases (kept for API compatibility) — now mapped to the calm
  // palette instead of neon so old call sites inherit the new look.
  hologram: '#5BC0FF',
  neonPink: '#FF6B9D',
  neonCyan: '#5BC0FF',
  neonViolet: '#8B7DFF',

  // Former "glass" tokens — now flat surfaces (glassmorphism retired).
  glassBg: '#17151D',
  glassBorder: '#242130',
  glassBorderLight: '#2E2A3B',
};

/** Gradient stop pairs — feed straight into <LinearGradient colors={...} />.
 *  All gradients are now tight, single-hue ramps: enough depth to feel alive,
 *  never a rainbow. `hologram`/`neon` alias the brand ramp for compatibility. */
export const gradients = {
  primary: ['#8B7DFF', '#6C5CE7'] as const,      // brand violet — primary actions
  vibrant: ['#FF6B9D', '#E8478B'] as const,      // pink ramp — workout action
  sunset: ['#FF8A5B', '#FF6B9D'] as const,
  cool: ['#5BC0FF', '#3D9BE8'] as const,         // blue ramp — tasks action
  success: ['#3DD68C', '#2BB673'] as const,
  surface: ['#17151D', '#121118'] as const,
  scrim: ['transparent', 'rgba(10,10,13,0.0)', 'rgba(10,10,13,0.92)'] as const,
  hologram: ['#8B7DFF', '#6C5CE7'] as const,     // legacy alias → brand ramp
  neon: ['#8B7DFF', '#6C5CE7'] as const,         // legacy alias → brand ramp
  darkSurface: ['#121118', '#0A0A0D'] as const,
};

/** Per-platform brand colors for badges / accents */
export const platformMeta: Record<string, { color: string; gradient: readonly [string, string]; icon: string; label: string }> = {
  youtube: { color: '#FF0033', gradient: ['#3A1520', '#2A0E16'], icon: 'logo-youtube', label: 'YouTube' },
  instagram: { color: '#E1306C', gradient: ['#38182B', '#26101E'], icon: 'logo-instagram', label: 'Instagram' },
  tiktok: { color: '#25F4EE', gradient: ['#12333A', '#0D2228'], icon: 'logo-tiktok', label: 'TikTok' },
  linkedin: { color: '#4A9DE0', gradient: ['#132A3F', '#0D1C2A'], icon: 'logo-linkedin', label: 'LinkedIn' },
  facebook: { color: '#4A90F2', gradient: ['#14263F', '#0D1A2A'], icon: 'logo-facebook', label: 'Facebook' },
  unknown: { color: '#8B7DFF', gradient: ['#252139', '#1A1728'], icon: 'globe-outline', label: 'Web' },
};

/** Category visual identity — icon + tint for chips and cards */
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

/** Tighter, iOS-leaning corner hierarchy: controls < cards < sheets. */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  full: 999,
};

/** Type scale — restrained, close to iOS defaults. Pair with the weights below. */
export const font = {
  xs: 11,      // caption
  sm: 13,      // footnote
  md: 15,      // body
  lg: 17,      // headline
  xl: 22,      // title
  xxl: 28,     // large title (screens)
  display: 34, // hero (landing only)
};

/** Reusable elevation presets (iOS shadow + Android elevation) — soft, not smoky. */
export const shadow = {
  sm: Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.18, shadowRadius: 4 },
    default: { elevation: 2 },
  }),
  md: Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.24, shadowRadius: 10 },
    default: { elevation: 5 },
  }),
  glow: Platform.select({
    ios: { shadowColor: colors.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.32, shadowRadius: 12 },
    default: { elevation: 8 },
  }),
} as const;

/** Legacy "glass" presets — now flat card styles (kept for API compatibility). */
export const glass = {
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  } as const,
  cardElevated: {
    backgroundColor: colors.cardElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadow.sm,
  } as const,
  neonBorder: {
    borderWidth: 1,
    borderColor: colors.accent + '33',
  } as const,
};

/** Legacy glow presets — toned down; prefer `shadow.glow`. */
export const glow = {
  violet: {
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  cyan: {
    shadowColor: colors.neonCyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  pink: {
    shadowColor: colors.neonPink,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
};
