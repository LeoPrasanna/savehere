import { Platform } from 'react-native';

/**
 * SaveHere design system — "Ember on Ink".
 *
 * A warm editorial dark identity: ink-black surfaces with a hint of warmth,
 * one ember-orange accent, cream text, and a serif display face (Fraunces) for
 * brand moments. Color is reserved for meaning (platform, category, status) —
 * the chrome stays quiet so the user's saved content is the loudest thing on
 * screen, and the warmth makes it feel human instead of "AI product".
 *
 * NOTE: token names are a stable API — screens import these by name. Add new
 * tokens freely; rename/remove only with a sweep of all usages.
 */

export const colors = {
  // Surfaces — warm ink. Each step is one perceptible notch brighter.
  background: '#0F0D0A',
  surface: '#161310',
  card: '#1C1814',
  cardElevated: '#252019',
  border: '#2B251D',        // hairline on card edges
  borderLight: '#383126',   // slightly stronger, for inputs/dividers

  // Primary accent — ember. Use for primary actions, active states and links;
  // never as large background washes.
  accent: '#FF6B3D',
  accentDark: '#E4501F',
  accentLight: '#FF9770',

  // Text — warm cream reads softer than pure #FFF on ink.
  textPrimary: '#F7F2E9',
  textSecondary: '#B3A99A',
  textTertiary: '#786F61',

  // Tags
  tagBg: '#292219',
  tagText: '#E8B98F',

  // Status
  danger: '#FF4D5E',
  success: '#4FCE8F',
  warning: '#FFC24D',

  // Legacy accent aliases (kept for API compatibility) — mapped into the warm
  // palette so old call sites inherit the new look.
  hologram: '#FFB35C',
  neonPink: '#FF6B8A',
  neonCyan: '#5FC9BD',
  neonViolet: '#FF6B3D',

  // Former "glass" tokens — now flat surfaces (glassmorphism retired).
  glassBg: '#1C1814',
  glassBorder: '#2B251D',
  glassBorderLight: '#383126',
};

/** Gradient stop pairs — feed straight into <LinearGradient colors={...} />.
 *  Tight, single-hue ramps: enough depth to feel alive, never a rainbow.
 *  `hologram`/`neon` alias the brand ramp for compatibility. */
export const gradients = {
  primary: ['#FF7A45', '#E4501F'] as const,      // ember ramp — primary actions
  vibrant: ['#FF5C7A', '#E43D5F'] as const,      // warm pink ramp — workout action
  sunset: ['#FFB35C', '#FF7A45'] as const,
  cool: ['#5FC9BD', '#3FA79B'] as const,         // teal ramp — tasks action
  success: ['#4FCE8F', '#33B274'] as const,
  surface: ['#1C1814', '#161310'] as const,
  scrim: ['transparent', 'rgba(15,13,10,0.0)', 'rgba(15,13,10,0.92)'] as const,
  hologram: ['#FF7A45', '#E4501F'] as const,     // legacy alias → brand ramp
  neon: ['#FF7A45', '#E4501F'] as const,         // legacy alias → brand ramp
  darkSurface: ['#161310', '#0F0D0A'] as const,
};

/** Per-platform brand colors for badges / accents */
export const platformMeta: Record<string, { color: string; gradient: readonly [string, string]; icon: string; label: string }> = {
  youtube: { color: '#FF0033', gradient: ['#3A1520', '#2A0E16'], icon: 'logo-youtube', label: 'YouTube' },
  instagram: { color: '#E1306C', gradient: ['#38182B', '#26101E'], icon: 'logo-instagram', label: 'Instagram' },
  tiktok: { color: '#25F4EE', gradient: ['#12333A', '#0D2228'], icon: 'logo-tiktok', label: 'TikTok' },
  linkedin: { color: '#4A9DE0', gradient: ['#132A3F', '#0D1C2A'], icon: 'logo-linkedin', label: 'LinkedIn' },
  facebook: { color: '#4A90F2', gradient: ['#14263F', '#0D1A2A'], icon: 'logo-facebook', label: 'Facebook' },
  unknown: { color: '#FF9770', gradient: ['#33251C', '#241A14'], icon: 'globe-outline', label: 'Web' },
};

/** Category visual identity — icon + tint for chips and cards.
 *  Vivid but warm-harmonized so they sit comfortably on ink. */
export const categoryMeta: Record<string, { icon: string; color: string }> = {
  all: { icon: 'all', color: '#FF6B3D' },
  fitness: { icon: 'fitness', color: '#FF6B8A' },
  cooking: { icon: 'cooking', color: '#FFAE52' },
  tech: { icon: 'tech', color: '#5FC9BD' },
  motivation: { icon: 'motivation', color: '#FF8A5B' },
  education: { icon: 'education', color: '#71C787' },
  entertainment: { icon: 'entertainment', color: '#C98BFF' },
  fashion: { icon: 'fashion', color: '#FF9BB1' },
  travel: { icon: 'travel', color: '#5FB9E8' },
  business: { icon: 'business', color: '#D9B36B' },
  news: { icon: 'news', color: '#A29C90' },
  health: { icon: 'health', color: '#63D69B' },
  finance: { icon: 'finance', color: '#F4C430' },
  general: { icon: 'general', color: '#B3A99A' },
  other: { icon: 'other', color: '#B3A99A' },
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

/** Typefaces. Manrope (loaded in app/_layout.tsx) is the display face for
 *  titles, headers and brand moments; body text stays on the system font
 *  (SF Pro on iOS) for native reading comfort. Until the font loads, RN falls
 *  back to the system face — same metrics class, no layout jump. */
export const typeface = {
  display: 'Manrope_800ExtraBold',
  displaySemi: 'Manrope_700Bold',
  displayMedium: 'Manrope_600SemiBold',
  // Editorial serif for brand moments only: landing greeting, hero numbers,
  // login wordmark, reel titles. Never on UI controls or body text.
  serif: 'Fraunces_700Bold',
  serifBlack: 'Fraunces_900Black',
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
