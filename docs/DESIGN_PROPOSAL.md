# DESIGN PROPOSAL — "Nocturnal Dimension" (DRAFT / EXPERIMENT)

> **Temporary file.** Design experiment only. No application code has been
> modified. Delete this file if the direction is rejected.
> Created 2026-08-09. Owner-approved suspension of the UI rules in
> [`HANDOFF.md`](HANDOFF.md) §4.5 for the duration of this experiment.

**Direction:** Suno's grainy amber/magenta haze mapped onto Dimension's safe
vertical layout + floating capsule nav. No `backdrop-filter` / `expo-blur`
anywhere — depth comes from one background gradient and opaque translucent
fills, so Android and web render identically to iOS.

**Sources (Refero, real token sets — nothing below is invented):**

| Ref | ID | Borrowed |
|---|---|---|
| Suno | `9844e7bf-4bff-48e6-8efc-e45002ce5226` | canvas, haze gradient, card surface, media-card radius |
| Dimension | `f2951292-dcf2-48db-af42-4bb3b783eb6e` | layout rhythm, capsule nav, translucent surfaces, pill radii |
| Hyper Foundation | `54511793-579d-4406-a389-4d83b7ade0f9` | serif display role, 60px button radius, accent-glow elevation |
| Vapi | `11db6cab-35f4-43bb-9ec3-053523f6b531` | CTA orange, pill button padding, card border treatment |

---

## 0. Two blockers found in the codebase — read before costing this

**a) "Ember on Ink" is not the live design system.** [`HANDOFF.md:186`](HANDOFF.md:186)
§4.5 describes ember-orange `#FF6B3D` + Fraunces. [`mobile/constants/theme.ts:86`](../mobile/constants/theme.ts:86)
ships `accent: '#F8F8F8'` with the comment *"there is no accent hue — 'accent'
IS the ink"*, `background: '#000000'`, all `gradients.*` flattened to a single
ink value, and every `platformMeta` colour set to `#F8F8F8`. The live system is
**monochrome**, not ember. §4.5 is stale documentation.

**b) Fraunces is not in the codebase.** [`theme.ts:492`](../mobile/constants/theme.ts:492)
sets `typeface.serif = 'Inter_600SemiBold'` and `serifBlack` likewise. Only
Inter is loaded. "Preserving Fraunces" is a **re-introduction**, not a
preservation: it needs `@expo-google-fonts/fraunces` added and loaded in
`app/_layout.tsx`. Spec'd below as such.

Consequence: this is not a tweak to an ember theme. It is a colour system
change from monochrome → chromatic, which touches every screen that reads
`colors.accent`, plus a font addition.

---

## 1. Colour tokens

Mapping onto the existing `PALETTES.dark` keys in `theme.ts` — no new key names,
so screens keep compiling unchanged.

| theme.ts key | Current | Proposed | Source |
|---|---|---|---|
| `background` | `#000000` | `#101012` | Suno Pitch Black |
| `surface` | `#000000` | `#101012` | Suno |
| `card` | `#0B0B0B` | `#17171A` | Suno Void Black |
| `cardElevated` | `#111111` | `#1E1E22` | Suno card +1 step |
| `border` | `rgba(248,248,248,0.12)` | `rgba(247,244,239,0.10)` | Suno prompt-container border |
| `borderLight` | `rgba(248,248,248,0.22)` | `rgba(247,244,239,0.20)` | Suno |
| `accent` | `#F8F8F8` | `#E96B34` | **Vapi Orange** |
| `accentDark` | `#D4D4D4` | `#C95524` | Vapi orange, darkened |
| `accentLight` | `#FFFFFF` | `#FD429C` | Suno Vivid Pink |
| `textPrimary` | `#F8F8F8` | `#F7F4EF` | Suno Ghost White |
| `textSecondary` | `#A8A8A8` | `#A3A3A3` | Suno Muted Steel |
| `textTertiary` | `#787878` | `#787878` | unchanged (4.8:1 floor) |
| `onAccent` | `#000000` | `#101012` | Suno Pitch Black |
| `ghostLine` | `rgba(248,248,248,0.12)` | `rgba(247,244,239,0.10)` | Suno |
| `tabBarTop` | `rgba(46,46,46,0.96)` | `rgba(30,30,34,0.94)` | Dimension floating bar |
| `tabBarBottom` | `rgba(12,12,12,0.96)` | `rgba(16,16,18,0.94)` | Suno base |

**Why Vapi Orange `#E96B34` and not Suno's pink.** It is 4 hue-degrees off the
retired ember `#FF6B3D`, so the accent change reads as continuity rather than a
rebrand, and it carries a real CTA role in its source system. Suno's pink is
demoted to `accentLight` — decoration and gradient stop only, never a fill.

**Reserved, do not promote to CTA** (their source systems say so explicitly):
`#F5D907` Suno Sunset Yellow (icon accent), `#97FCD7` Hyper Aura Mint (glow
only), `#6B62F2` Dimension Interactive Glow (ambient lines only).

### The haze — one gradient, whole app

```
gradients.haze = [
  '#101012',              // 0%   top — pure canvas
  'rgba(253,66,156,0.10)',// 45%  Suno Vivid Pink, 10%
  'rgba(233,107,52,0.14)',// 78%  Vapi Orange, 14%
  '#101012',              // 100% bottom — back to canvas
]
```

One `<LinearGradient>` at the root of the home screen, `pointerEvents="none"`,
sized to the full scroll container, **not** per-card. Zero blur, zero
`backdrop-filter`, so it is a single GPU-cheap draw on web and Android.

Grain: Suno's texture comes from a tiled noise overlay. **No such asset exists
in `mobile/assets/`.** It must be generated (128×128 tiled PNG, ~4% opacity,
`resizeMode="repeat"`) before grain can be claimed — do not spec a path that
isn't there. Ship without grain if the asset isn't produced; the gradient works
alone.

---

## 2. Typography

Keep Inter as the working face. Add Fraunces back for brand moments only.

| Role | Face | Size | Line height | Tracking |
|---|---|---|---|---|
| Brand header (home greeting) | **Fraunces 400** | 36 | 1.0 | 0 |
| Reel title | **Fraunces 400** | 22 | 1.2 | 0 |
| Screen title | Inter 600 | 24 | 1.2 | −0.4px |
| Section label | Inter 500, uppercase | 10 | 1.4 | +1.2px |
| Body | system | 15 | 1.6 | 0 |
| Caption / meta | Inter 400 | 12 | 1.5 | 0 |

Serif line-height 1.0 at display size is Hyper's `0.75`-inspired ratio, relaxed
for mobile legibility. Fraunces on buttons, labels, or body copy: never.

**Cost:** `npx expo install @expo-google-fonts/fraunces`, one entry in the
`useFonts` map in `app/_layout.tsx`, ~180KB added to the web bundle.

---

## 3. Spacing, radius, elevation

Existing `spacing` scale (4/8/16/24/32/48) already matches Dimension's 4px base
— **no change needed**. Radius needs three edits:

| `radius` key | Current | Proposed | Source |
|---|---|---|---|
| `md` | 12 | 12 | unchanged (Suno cards/inputs = 12px) |
| `lg` | 16 | 16 | unchanged |
| `xl` | 20 | **24** | Dimension card radius |
| `full` | 999 | 999 | unchanged (Dimension `9999px`) |

- **Section gap:** 40 (Dimension). Suno's 100–150px is desktop-only — do not port it.
- **Card padding:** 16 (`spacing.md`) — agrees across Dimension and Vapi.
- **Element gap:** 8 (`spacing.sm`) — Dimension and Vapi both.
- **Elevation:** no drop shadows. Hierarchy = surface step (`#101012` → `#17171A`
  → `#1E1E22`) + 1px hairline border. One exception: the FAB carries
  `shadowColor: '#E96B34', shadowOpacity: 0.35, shadowRadius: 20, elevation: 0`
  (Hyper's accent-glow pattern, recoloured to our accent).

---

## 4. Home layout hierarchy

Single column, full-bleed gradient, content in a max-width centred column.

```
Root  (bg #101012)
└─ LinearGradient haze          full-bleed, pointerEvents none, absolute fill
   └─ ScrollView                paddingHorizontal 16, paddingBottom 96
      ├─ Header                 pt = insets.top + 24
      │  ├─ Greeting            Fraunces 36 · #F7F4EF
      │  └─ Sub                 Inter 15 · #A3A3A3 · mt 4
      ├─ Filter pill row        h 36 · gap 8 · mt 24 · horizontal scroll
      │                         inactive: bg rgba(247,244,239,0.05), radius 999
      │                         active:   bg #E96B34, text #101012
      ├─ Section label          "RECENT" · Inter 500 · 10 · +1.2px · mt 40
      └─ ReelCard list          gap 8
         └─ ReelCard            bg #17171A · radius 24 · p 16
            ├─ Thumbnail        radius 12 · aspect 16:9 (Suno media treatment)
            ├─ Title            Fraunces 22 · #F7F4EF · mt 12
            └─ Meta row         Inter 12 · #A3A3A3 · gap 8 · mt 4
```

Rules carried over from §4.5 that this experiment does **not** break: real
`thumbnail_url` via `thumbUrl()`, content never covered by chrome, icons only
via `components/Icon.tsx`, motion 250–350ms entrance with no loops or shimmer.

---

## 5. Capsule bottom navigation — exact parameters

Dimension's floating pill bar, opaque instead of blurred.

| Property | Value |
|---|---|
| Position | `absolute`, `bottom: insets.bottom + 8`, `left: 16`, `right: 16` |
| Height | 60 |
| Radius | 999 (`radius.full`) |
| Background | `#1E1E22` at 94% → `rgba(30,30,34,0.94)` |
| Border | 1px `rgba(247,244,239,0.10)` |
| Shadow | none on Android/web; iOS `shadowOpacity 0.25, radius 24, offset {0,8}` |
| Item count | 4 tabs + centre FAB |
| Item layout | icon 22 above label 10 (Inter 500, +0.6px), gap 2 |
| Inactive | icon + label `#A3A3A3` |
| Active | icon + label `#F7F4EF`, plus a 4×4 `#E96B34` dot 6px below the label |
| Press | opacity 0.55 / scale 0.97, 200ms (`motion.micro` — existing token) |

**Centre FAB**

| Property | Value |
|---|---|
| Size | 56×56, radius 999 |
| Offset | centred, `bottom: insets.bottom + 22` (overlaps the bar by 14) |
| Fill | `linear-gradient(135deg, #E96B34 → #FD429C)` |
| Icon | plus, 24, `#101012` |
| Glow | `shadowColor #E96B34`, opacity 0.35, radius 20 |
| Ring | 3px `#101012` ring so it reads as cut out of the bar |

The gradient fill is the **only** multi-hue gradient in the app besides the
background haze. Everything else is flat.

---

## 6. Scope if approved

Files this direction touches (estimate, not yet verified line by line):

1. `mobile/constants/theme.ts` — palette values, `radius.xl`, new `gradients.haze`, `typeface.serif`.
2. `mobile/app/_layout.tsx` — load Fraunces.
3. `mobile/app/(tabs)/_layout.tsx` — capsule bar + FAB (currently a standard tab bar).
4. Home screen — haze gradient root, header, filter pills.
5. `components/ReelCard.tsx` — radius 24, serif title.
6. Every screen reading `colors.danger` / `success` / `warning` — these are all
   `#F8F8F8` today by design (destructive reads by inversion + wording). A
   chromatic accent makes that convention ambiguous; decide before implementing
   whether danger becomes a real red.

**Open question for the owner:** item 6. Introducing one chromatic accent while
`danger`/`success`/`warning` stay monochrome means orange is the only colour on
screen — a delete button and a save button would both be orange. Either keep
destructive-by-inversion and accept it, or spec a red. Not guessing on this.
