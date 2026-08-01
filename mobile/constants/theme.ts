import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  // ── Surface ladder ──────────────────────────────────────────────────
  // Elevation is expressed by STEPPING THIS LADDER, never by a shadow and
  // never by a border. (Warp: "Never use borders or shadows to separate
  // co-planar sections.") Each step is one perceptible notch brighter, so a
  // card on a card still reads as raised without any drop shadow.
  //
  // The canvas is #0F0D0A — the same value Cron Calendar uses, arrived at
  // independently. It was never the problem; the discipline around it was.
  background: '#0F0D0A',    // 0 — canvas
  surface: '#161310',       // 1 — sheets, headers
  card: '#1C1814',          // 2 — cards, inputs
  cardElevated: '#252019',  // 3 — raised card, active chip, menu
  border: '#2B251D',        // hairline — DIVIDES, never elevates
  borderLight: '#383126',   // stronger hairline, for inputs/dividers

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
/**
 * ⚠️ These are deliberately FLAT — both stops of every action ramp are the same
 * colour, so a <LinearGradient> renders as a solid fill.
 *
 * A gradient on every primary action is the single most recognisable
 * "an agent made this" signature in modern UI, and both locked references ban
 * it outright (Cron: "every button is either Action Orange or Deep Graphite").
 * Flattening here kills it across ~20 call sites without touching one of them —
 * the components keep their LinearGradient and simply stop looking generated.
 *
 * `scrim` and `darkSurface` keep real stops: those are legitimate image
 * treatments (a scrim over a thumbnail), not decoration on a control.
 */
export const gradients = {
  primary: ['#FF6B3D', '#FF6B3D'] as const,      // ember — primary actions, FLAT
  vibrant: ['#FF6B3D', '#FF6B3D'] as const,      // was pink; one accent only now
  sunset: ['#FF6B3D', '#FF6B3D'] as const,
  cool: ['#FF6B3D', '#FF6B3D'] as const,         // was teal; one accent only now
  success: ['#4FCE8F', '#4FCE8F'] as const,      // status colour, keeps its role
  surface: ['#1C1814', '#1C1814'] as const,
  scrim: ['transparent', 'rgba(15,13,10,0.0)', 'rgba(15,13,10,0.92)'] as const,
  hologram: ['#FF6B3D', '#FF6B3D'] as const,     // legacy alias → brand
  neon: ['#FF6B3D', '#FF6B3D'] as const,         // legacy alias → brand
  darkSurface: ['#161310', '#0F0D0A'] as const,
};

/** Per-platform brand colors for badges / accents */
export const platformMeta: Record<string, { color: string; gradient: readonly [string, string]; icon: string; label: string }> = {
  youtube: { color: '#FF0033', gradient: ['#3A1520', '#2A0E16'], icon: 'logo-youtube', label: 'YouTube' },
  instagram: { color: '#E1306C', gradient: ['#38182B', '#26101E'], icon: 'logo-instagram', label: 'Instagram' },
  tiktok: { color: '#25F4EE', gradient: ['#12333A', '#0D2228'], icon: 'logo-tiktok', label: 'TikTok' },
  linkedin: { color: '#4A9DE0', gradient: ['#132A3F', '#0D1C2A'], icon: 'logo-linkedin', label: 'LinkedIn' },
  facebook: { color: '#4A90F2', gradient: ['#14263F', '#0D1A2A'], icon: 'logo-facebook', label: 'Facebook' },
  twitter: { color: '#8AA0B4', gradient: ['#1C242B', '#12181D'], icon: 'logo-twitter', label: 'X' },
  unknown: { color: '#FF9770', gradient: ['#33251C', '#241A14'], icon: 'globe-outline', label: 'Web' },
};

/**
 * Category identity is carried by the ICON and the LABEL — not by a hue.
 *
 * The previous map gave all 16 categories their own colour (fitness pink,
 * cooking orange, tech teal, beauty magenta…). Designed products constrain
 * colour; they don't assign every noun a hue. Both locked references forbid a
 * second chromatic colour outright, and a 16-colour taxonomy is sixteen of them.
 *
 * Every category now resolves to the same quiet tint. `color` is retained as a
 * key because ~6 call sites read it — they now all read the same value, so the
 * rainbow disappears without a single component edit.
 */
const CATEGORY_TINT = '#B3A99A';   // = textSecondary; reads as label, not signal

export const categoryMeta: Record<string, { icon: string; color: string }> = {
  all: { icon: 'all', color: CATEGORY_TINT },
  fitness: { icon: 'fitness', color: CATEGORY_TINT },
  cooking: { icon: 'cooking', color: CATEGORY_TINT },
  tech: { icon: 'tech', color: CATEGORY_TINT },
  motivation: { icon: 'motivation', color: CATEGORY_TINT },
  education: { icon: 'education', color: CATEGORY_TINT },
  entertainment: { icon: 'entertainment', color: CATEGORY_TINT },
  fashion: { icon: 'fashion', color: CATEGORY_TINT },
  beauty: { icon: 'beauty', color: CATEGORY_TINT },
  travel: { icon: 'travel', color: CATEGORY_TINT },
  business: { icon: 'business', color: CATEGORY_TINT },
  news: { icon: 'news', color: CATEGORY_TINT },
  health: { icon: 'health', color: CATEGORY_TINT },
  finance: { icon: 'finance', color: CATEGORY_TINT },
  general: { icon: 'general', color: CATEGORY_TINT },
  other: { icon: 'other', color: CATEGORY_TINT },
};

export const categoryFor = (c?: string | null) =>
  categoryMeta[(c || 'other').toLowerCase()] ?? categoryMeta.other;

/* ── Accent theme (Appearance) ───────────────────────────────────────────────
 * ONE accent. Iris / Ocean / Forest / Rose were removed 2026-07-31: a product
 * whose accent the user can repaint does not own a colour, and both locked
 * references ban a second chromatic hue (Cron: "Do not introduce additional
 * vivid chromatic colors"; Warp: "a second hue breaks the restraint").
 *
 * The MECHANISM below is deliberately kept intact. It is load-bearing — every
 * themed() sheet re-runs through it — and it costs nothing to keep while the
 * set is a single entry. Re-adding a palette is a one-line change if that
 * decision is ever reversed.
 *
 * Switching is LIVE:
 * `setAccentTheme()` mutates the token objects, regenerates every style sheet
 * created through `themed()` (module-level StyleSheet.create freezes values,
 * so those sheets are wrapped in factories that re-run on change), then
 * notifies subscribers — the root layout bumps a remount key and the whole
 * tree re-renders with the new palette in one frame. No page reload.
 *
 * Boot: web reads the stored key synchronously (localStorage) so the first
 * paint is already themed; native applies right after the root layout's
 * AsyncStorage read (see app/_layout.tsx) — a brief default-color first frame.
 */
export const ACCENT_STORAGE_KEY = '@savehere:accent:v1';

export interface AccentTheme {
  key: string;
  label: string;
  accent: string;
  accentDark: string;
  accentLight: string;
  ramp: readonly [string, string];   // primary-action gradient
}

export const accentThemes: readonly AccentTheme[] = [
  { key: 'ember',  label: 'Ember',  accent: '#FF6B3D', accentDark: '#E4501F', accentLight: '#FF9770', ramp: ['#FF6B3D', '#FF6B3D'] },
];

function applyAccentTheme(t: AccentTheme) {
  colors.accent = t.accent;
  colors.accentDark = t.accentDark;
  colors.accentLight = t.accentLight;
  colors.neonViolet = t.accent;               // legacy alias follows the accent
  const g = gradients as Record<string, readonly string[]>;
  g.primary = t.ramp;
  g.hologram = t.ramp;                        // legacy aliases → brand ramp
  g.neon = t.ramp;
  categoryMeta.all.color = t.accent;
}

// Derived token objects (shadow.glow / glass / glow) captured colors.accent at
// their own module init. Only called from setAccentTheme at runtime — at boot
// they don't exist yet (declared below) and self-initialize from the already-
// mutated colors.
function refreshDerivedTokens(t: AccentTheme) {
  const sg = shadow.glow as Record<string, unknown>;
  if ('shadowColor' in sg) sg.shadowColor = t.accent;         // iOS branch only
  (glass.neonBorder as { borderColor: string }).borderColor = t.accent + '33';
  (glow.violet as { shadowColor: string }).shadowColor = t.accent;
}

// Two-phase notify: style sheets must be regenerated BEFORE React subscribers
// re-render, or the remounted tree would still read the old sheets.
const _sheetRegens = new Set<() => void>();
const _accentSubs = new Set<() => void>();

/** Subscribe to accent changes (used by the root layout to remount the tree).
 *  Returns an unsubscribe function. */
export function onAccentChange(fn: () => void): () => void {
  _accentSubs.add(fn);
  return () => { _accentSubs.delete(fn); };
}

/**
 * Wrap any module-level object whose values bake in accent tokens — a
 * StyleSheet.create(...) call, a color map, a steps array. The factory re-runs
 * on every accent change and the returned proxy always forwards to the latest
 * result, so `styles.foo` at render time is never stale.
 *
 *   const styles = themed(() => StyleSheet.create({ ... }));
 */
export function themed<T extends object>(factory: () => T): T {
  let current = factory();
  _sheetRegens.add(() => { current = factory(); });
  return new Proxy({} as T, {
    get: (_, prop) => (current as Record<PropertyKey, unknown>)[prop as never],
    has: (_, prop) => prop in current,
    ownKeys: () => Reflect.ownKeys(current),
    getOwnPropertyDescriptor: (_, prop) => Object.getOwnPropertyDescriptor(current, prop),
  });
}

/** Switch the accent LIVE: mutate tokens → regenerate themed() sheets → notify
 *  subscribers (root remounts) → persist. Works on web and native. */
export function setAccentTheme(key: string, opts?: { persist?: boolean }) {
  const t = accentThemes.find(x => x.key === key);
  if (!t || key === _activeKey) return;
  _activeKey = key;
  applyAccentTheme(t);
  refreshDerivedTokens(t);
  _sheetRegens.forEach(fn => fn());
  _accentSubs.forEach(fn => fn());
  if (opts?.persist !== false) {
    if (Platform.OS === 'web') {
      try { window.localStorage.setItem(ACCENT_STORAGE_KEY, key); } catch {}
    }
    AsyncStorage.setItem(ACCENT_STORAGE_KEY, key).catch(() => {});
  }
}

// Boot read — web only (sync localStorage), so the first paint is themed. On
// native app/_layout.tsx reads AsyncStorage after mount and calls setAccentTheme.
let _storedAccent: string | null = null;
if (Platform.OS === 'web') {
  try { _storedAccent = window.localStorage.getItem(ACCENT_STORAGE_KEY); } catch {}
}
let _activeKey: string =
  accentThemes.some(t => t.key === _storedAccent) ? (_storedAccent as string) : 'ember';
if (_activeKey !== 'ember') {
  applyAccentTheme(accentThemes.find(t => t.key === _activeKey)!);
}

/** The currently applied accent key (live — reflects setAccentTheme). */
export function getAccentKey(): string {
  return _activeKey;
}

/** The categories a reel can be assigned to (auto or user-picked). Excludes the
 *  'all' filter pseudo-category. Keep in sync with backend ALLOWED_CATEGORIES. */
export const CATEGORY_OPTIONS = [
  'fitness', 'cooking', 'tech', 'motivation', 'education', 'entertainment',
  'fashion', 'beauty', 'travel', 'business', 'news', 'health', 'finance', 'other',
] as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

/**
 * Three radii cover ~90% of the UI (Warp's rule): buttons 4, cards 16, pills
 * for icon-only controls. A precise 4px control against a 16px card is what
 * reads as engineered; uniform 12px everywhere reads as a default.
 *
 * Names are unchanged — call sites keep working, the shapes sharpen.
 */
export const radius = {
  sm: 4,      // buttons, inputs, chips — was 8
  md: 10,     // small cards, toasts — was 12
  lg: 16,     // cards, sheets (Warp: cards 16px)
  xl: 20,     // large sheets — was 22
  full: 999,  // pills — icon-only controls, badges
};

/**
 * Motion, from Warp: 0.4s for state changes on a deliberately mechanical curve,
 * 0.15s for micro-interactions. Deliberate and weighty, not bouncy.
 *
 * ⚠️ Warp's rule, worth keeping: transition COLOUR and OPACITY, never transform
 * or scale, on anything navigational. Scale belongs to press feedback only
 * (see components/Pressable.tsx), which is why it is not listed here.
 */
export const motion = {
  instant: 120,   // toggles, checkbox fills
  micro: 150,     // hover/press colour shifts
  base: 240,      // enter/exit of local elements
  state: 400,     // considered state change — Warp's signature duration
  easing: [0.44, 0, 0.56, 1] as const,
};

/**
 * ONE typeface. Manrope carries every weight; hierarchy comes from size and
 * weight, not from switching family.
 *
 * Three families (Manrope + Fraunces serif + system) was a collection, not a
 * system — and it is one of the audit's "assembled, not designed" tells. Both
 * locked references use a single face across their whole range (Cron: Helvetica
 * Neue from 13px to 140px; Warp: Matter for everything).
 *
 * `serif` / `serifBlack` are kept as KEYS and now resolve to Manrope, so the
 * ~8 call sites that ask for a serif stop rendering a third font without any
 * of them needing to change. Remove the keys in a later slice once those call
 * sites are rewritten.
 */
export const typeface = {
  display: 'Manrope_800ExtraBold',
  displaySemi: 'Manrope_700Bold',
  displayMedium: 'Manrope_600SemiBold',
  serif: 'Manrope_800ExtraBold',        // was Fraunces_700Bold
  serifBlack: 'Manrope_800ExtraBold',   // was Fraunces_900Black
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
  /**
   * ⚠️ Formerly an ember-tinted glow behind every primary action. Cron's
   * explicit don't: "avoid box shadows that introduce strong light colors or
   * blur". Now a plain neutral elevation, so ~10 call sites that spread
   * `...shadow.glow` stop glowing without being edited.
   */
  glow: Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.28, shadowRadius: 10 },
    default: { elevation: 5 },
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
