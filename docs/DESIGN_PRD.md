# SaveHere — UI/UX Overhaul PRD

> Scope of this document: a **visual and interaction redesign** of the existing app.
> No feature is added, removed, or rewired. Every screen keeps the behaviour it has
> today; what changes is how it looks, how it moves, and how coherent it feels.
>
> Status: **draft awaiting owner decisions** (see §8). Nothing is implemented yet.

---

## 1. The product, in one paragraph

SaveHere turns short-form content people save and forget into something they act on.
A user shares a Reel / Short / TikTok / LinkedIn post into the app; it extracts the
content, writes a grounded AI summary and tags, and then converts it into action —
recipes, task checklists, workout plans, trip itineraries — plus search, rediscovery,
"ask your whole library", and a to-do list. iOS-first, Android next. Pre-launch,
solo developer, no paying users yet.

**The emotional promise:** *you are not a hoarder, you are someone who follows through.*
The UI currently does not carry that promise. It looks like a competent developer's
dark theme, not like a product with a point of view.

---

## 2. Why this work exists

The owner's assessment: the current UI reads as **agent-generated styling**, not as
professionally designed product. That assessment is correct, and it's diagnosable
rather than vague. The specific tells:

| Tell | Where | Why it reads as AI-made |
|---|---|---|
| **Retired effects still in the tree** | `AuroraBackground`, `BorderBeam`, `HolographicShimmer`, `FloatingParticleField`, `GlassCard` | Glassmorphism was formally retired (see `docs/CONTEXT.md`) but the components survived and are still mounted. A holographic shimmer sweeps the greeting line on the home screen. Real products don't ship decommissioned effects. |
| **Gradient on every primary action** | Save, New task, Keep the save, modal CTAs | `LinearGradient` + `shadow.glow` is the single most recognisable "AI made this" signature in 2020s UI. |
| **A 16-hue category rainbow** | `categoryMeta` in `theme.ts` | fitness pink, cooking orange, tech teal, motivation coral, education green, entertainment purple, fashion pink, beauty magenta, travel blue, business gold, finance yellow… Designed products constrain colour; they don't assign every noun its own hue. |
| **Five user-switchable accents** | Appearance settings (Ember/Iris/Ocean/Forest/Rose) | A product that lets the user repaint its identity has, by definition, no identity. Strong apps commit. |
| **Three typefaces** | Manrope (display) + Fraunces (serif brand) + system (body) | Two is a system. Three is a collection. |
| **Decoration standing in for hierarchy** | Sparkle icon + shimmer on the greeting tip | When a line needs an animated sparkle to feel important, the type scale isn't doing its job. |
| **Inconsistent surfaces** | Todo screen invented its own nav pill; had to be retrofitted to match Library's header trio mid-session | Components were designed per-screen instead of from a system. |

**None of this is a functional defect.** Everything works. The problem is that the app
looks assembled rather than designed, and that is exactly what a redesign fixes.

---

## 3. Complete surface inventory

Everything below must end up visually consistent. **12 screens, 24 components, ~8,400 lines of TSX.**

### 3.1 Screens (`mobile/app/`)

| Screen | Purpose | Redesign notes |
|---|---|---|
| `index.tsx` | **Library** — grid of saved reels, category chips, bottom-docked search. Also hosts the Landing branch. | Densest screen. Card design is the app's signature object. |
| `components/Landing.tsx` | **Home** — greeting, Ask row, slate block (Today \| Upcoming), recent carousel, bottom Library/Save bar | First screen after login. Currently the most cluttered. |
| `reel/[id].tsx` | **Reel detail** — hero, summary, notes, add-to-slate, tasks/recipe, workout, itinerary, disclaimers | Biggest screen (~1,000 lines). Most stacked sections. |
| `todos.tsx` | **Slate / Follow Through** — rolling hero, goal bar, stat tiles, quotes, grouped tasks, undo bar | Newest, most recently iterated. |
| `save.tsx` | **Save a Reel** (modal) — paste link, clipboard button | Highest-frequency action in the whole app. |
| `ask.tsx` | **Ask your library** — question box, token-streamed answer, sources | Streaming text needs its own typographic treatment. |
| `rediscover.tsx` | **Rediscover** — resurfaces older saves | Currently a plain grid; the concept deserves better. |
| `workout/[reelId].tsx` | Workout plan — exercises, sets/reps/rest | |
| `workout/session/[reelId].tsx` | Guided session player (headerless) | Full-screen focus mode; different rules apply. |
| `help.tsx` | What you can do | |
| `profile.tsx` | Edit profile | |
| `_layout.tsx` | Stack config, auth gate, fonts, accent boot | Header style lives here. |

### 3.2 Components (`mobile/components/`)

**Core objects:** `ReelCard`, `TaskList`, `TodoEditor`, `DatePicker`, `TodoGoalBar`,
`TodoSettingsSheet`, `Disclaimer`, `TagBadge`, `SkeletonCard`, `Icon`, `Pressable`,
`HomeButton`

**Chrome:** `LoginScreen`, `OnboardingModal`, `ProfilePanel`, `Landing`, `RollingTagline`

**Effects (candidates for deletion):** `AuroraBackground`, `BorderBeam`,
`HolographicShimmer`, `FloatingParticleField`, `GlassCard`, `Confetti`, `LibraryBackdrop`

### 3.3 Design system today (`constants/theme.ts`)

- **Identity:** "Ember on Ink" — warm ink surfaces (`#0F0D0A`), ember accent (`#FF6B3D`), cream text (`#F7F2E9`)
- **Type:** Manrope (display) · Fraunces (serif brand moments) · system (body); scale 11→34
- **Spacing:** 4/8/16/24/32/48 · **Radius:** 8/12/16/22/full
- **Elevation:** `shadow.sm/md/glow` · legacy `glass.*` and `glow.*` maps still present
- **Theming mechanism:** `themed()` — any sheet baking in accent tokens must be wrapped or it goes stale on accent switch. **This is load-bearing and must survive the redesign.**

---

## 4. In scope

1. **One visual identity**, applied to all 12 screens and all components with no exceptions.
2. **A real type scale** — sizes, weights, line-heights, and the rules for when each is used.
3. **Constrained colour** — defined roles (surface, text, accent, status, category) rather than a hue per concept.
4. **Component system** — cards, buttons, inputs, chips, sheets, modals, empty states, skeletons, toasts, headers defined once and reused. No more per-screen invention.
5. **Motion language** — a documented set of durations, easings, and when motion is allowed. Replaces the current ad-hoc mix.
6. **Deletion of decommissioned effects** — the retired glassmorphism/holographic layer goes.
7. **Optional mascot** — pending decision in §8.
8. **Accessibility floor** — contrast ratios, ≥44pt touch targets, focus states.

## 5. Out of scope

- Any change to backend, API, data model, or business logic
- Any change to what a screen *does* — only how it looks and moves
- New features, new screens, new endpoints
- The 5 accent themes' *mechanism* (`themed()`) — though the palette set is in question (§8)
- Anything that alters AI cost, quotas, or entitlements

---

## 6. Constraints

- **React Native + Expo SDK 56.** No web-only CSS. Check versioned docs before using any Expo API.
- **Runs on web during development** — every effect must work in `react-native-web` or degrade cleanly.
- **`themed()` discipline** — any StyleSheet baking in accent tokens must go through it.
- **No new heavy dependencies** without justification; prefer what's installed (Moti/Reanimated, Lucide, expo-linear-gradient).
- **Ship in reviewable slices.** 8,400 lines cannot land in one PR anyone can actually review.
- **`npm run typecheck` and `npx expo export --platform web` must stay green.**
- **Owner verifies visually** — the agent's preview browser has no session, so logged-in screens cannot be self-verified.

---

## 7. Success criteria

The redesign succeeds when:

1. A screenshot of any screen is **recognisably the same product** as any other screen.
2. None of the §2 tells survive.
3. There is **one memorable thing** a user would describe to a friend.
4. Every visual decision traces to a reference, a constraint, or a craft rule — not taste-by-vibe.
5. Nothing about how the app *works* changed.

---

## 8. Research (Refero, 2026-07-31)

4 style searches · 3 full style references · 3 iOS screen sweeps (~30 screens).

### 8.1 The finding that decides the direction

**Cron Calendar's canvas is `#0f0d0a`. SaveHere's canvas is `#0F0D0A`.** Byte-identical,
arrived at independently. Cron's accent is Action Orange `#ff4700`; ours is ember `#FF6B3D`.

So the identity isn't wrong — **the discipline is missing**. Cron ships the same palette and
reads as a premium instrument because of what it *refuses* to do: one chromatic colour, 4px
button radius, no gradients, no glow, flat surfaces, one typeface across all weights.

That reframes this work. It is not "pick a new look". It is **"enforce the look we already have."**

### 8.2 Styles reviewed

| Style | What it contributes |
|---|---|
| **Cron Calendar** (primary) | Near-black canvas + exactly one vivid orange. 4px buttons, 9999px pills. 80px section rhythm. One typeface, hierarchy by weight. Explicit don't: *"Do not introduce additional vivid chromatic colors beyond Action Orange"* and *"avoid box shadows that introduce strong light colors or blur."* |
| **Warp** (borrow: surfaces + motion) | Elevation via **background-color steps only** — `#090909 → #121212 → #1e1e1d → #353534` — *"Never use borders or shadows to separate co-planar sections."* Radius discipline: 16px cards / 4px buttons / 50px pills for icon controls only. Motion: 0.4s `cubic-bezier(0.44, 0, 0.56, 1)`, transition colour and opacity **never transform**. And: *the product screenshot IS the hero object.* |
| **PostHog** (borrow: mascot) | Hedgehog mascots — flat, outlined, brightly coloured, **explanatory not decorative**, contained in the content area, never full-bleed. Proof that a disciplined tool can carry a character without becoming childish. |

### 8.3 iOS screens reviewed

**Library / saved-items** (Netflix *My List*, YouTube Music, ElevenMusic, Wabi): one pattern,
repeatedly — large title → horizontal filter-chip rail → grid or list of thumbnail cards →
persistent bottom chrome. SaveHere already does this. It's structurally correct.

**Task lists** (Todoist ×5, Asana, Rise, Canopi): also one pattern — single column, **collapsible
grouped sections**, circular checkboxes carrying priority as colour, due-date metadata under the
title, and a **bottom-right floating action button** to add.

> ⚠️ **Concrete divergence:** every serious iOS task app puts *add* in a bottom-right FAB.
> SaveHere uses a full-width "New task" bar that eats a permanent strip of screen. This is the
> clearest evidence-backed change in the whole audit.

**Empty states** (Klarna ×2 dark-mode, Oku, Telegram, SeatGeek, Loowner, Vocabulary, District):
unanimous structure — centred stack of **illustration → heading → one line of support copy → a
single primary button**. Oku uses a cat-in-a-box; Telegram a duck; Klarna a storefront.

> This settles the mascot question with evidence: **the mascot's job is the empty state.**
> That is where the industry consistently puts a character, and SaveHere has many empty states
> (no saves, nothing due, no search results, nothing to rediscover).

### 8.4 Reference lock

```text
Primary direction:  Cron Calendar — dark instrument panel, one chromatic accent
Preserve:           #0F0D0A canvas · exactly ONE vivid accent · 4px button radius ·
                    flat surfaces (no gradient, no glow) · generous vertical rhythm ·
                    ONE typeface, hierarchy carried by weight and size
Borrow (Warp):      elevation by background-color steps ONLY, never shadow/border ·
                    radius set {cards 16, buttons 4, pills icon-only} ·
                    motion 0.4s cubic-bezier(.44,0,.56,1), colour/opacity never transform
Borrow (PostHog):   mascot — flat, outlined, explanatory, contained, empty-states only
Role rules:         Accent = primary CTA + active state ONLY. Never a background wash,
                    never a per-category tint, never decorative border.
                    Status colours (danger/success/warning) keep their semantic role only.
Media strategy:     the reel thumbnail IS the hero object (Warp). 16px radius, image
                    bleeds to the card edge and is masked by the radius — not inset.
Reject:             gradient CTAs · shadow.glow · 16-hue category rainbow ·
                    5 user-switchable accents · a third typeface · glassmorphism remnants ·
                    decorative sparkle/shimmer standing in for hierarchy
```

### 8.5 Decision ledger — every §2 tell, killed by a sourced rule

| Tell in the current app | Source rule that kills it | Resulting change |
|---|---|---|
| Gradient + glow on every CTA | Cron: *"Avoid generic button styles; every button is either Action Orange or Deep Graphite"* + *"avoid box shadows that introduce strong light colors or blur"* | Flat accent fill, 4px radius, no `LinearGradient`, no `shadow.glow` |
| 16-hue category rainbow | Cron: *"Do not introduce additional vivid chromatic colors"* · Warp: *"a second hue breaks the restraint"* | Categories carry **icon + label**, not hue. One neutral chip treatment. |
| 5 switchable accents | Same rule — an identity cannot be user-repainted | See Q2 |
| 3 typefaces | Cron uses **one** face across 13→140px; Warp uses one (Matter) for everything | Collapse to one family; drop the serif |
| Retired glass/holographic effects still mounted | Warp: *"depth is communicated through surface color steps, not elevation effects"* | Delete `AuroraBackground`, `BorderBeam`, `HolographicShimmer`, `FloatingParticleField`, `GlassCard` |
| Sparkle + shimmer to make a line feel important | Cron: hierarchy is weight and size, not ornament | Type scale does the work |
| Per-screen invented components | Warp's three-radius system covers 90% of components | One component set, defined once |
| Full-width "New task" bar | iOS task-app convention: bottom-right FAB (Todoist, Asana, Rise, Canopi) | FAB, returning a strip of screen |

---

## 9. DECISIONS — settled 2026-07-31

| # | Decision | Consequence |
|---|---|---|
| **Identity** | **Ember on Ink wins.** Resolved by implication — the owner chose "collapse to **ember** only", which cannot coexist with the purple mockups. Mockups are harvested for *structure* (priority badges, "Top Priority" grouping, tab bar), not palette. | Canvas `#0F0D0A` + one ember accent, enforced with Cron's discipline. |
| **Nav** | **5-tab bottom bar** — Home · Library · Save · Slate · Ask. | Replaces the Home↔Library session-flag toggle. Kills that bug class at the root. **This is a UX change and is explicitly authorised.** |
| **Accents** | **Collapse to ember alone.** Picker removed from Appearance; `themed()` mechanism retained. | Iris / Ocean / Forest / Rose deleted. |
| **Sequencing** | **Foundations first, then re-decide.** | Slice 1 ships alone; owner judges before the rest is committed to. |
| **Design tooling** | **`/refero-design` only.** No `canvas-design`, no generated imagery. | See mascot note below. |

### 9.1 Mascot — deferred by tooling constraint, slot reserved

Research says the mascot belongs in empty states (§8.3), but generated imagery is now out of
scope. Per the skill's own media rule — *"if you cannot produce the needed asset, preserve the
slot with stable dimensions, aspect ratio, and a short art-direction note"* — the empty-state
component ships with a **reserved 160×160 media slot** and art direction recorded, filled later
with a real asset. It will **not** be faked with CSS shapes or a stack of icons.

**Art direction for whoever draws it:** flat, outlined, two-tone (ink + ember), no gradients,
no 3D. Readable at 160px. One character in four situations: nothing saved, nothing due, nothing
found, nothing to rediscover.

---

## 9x. Original open questions (superseded by §9)

These change the work materially. Nothing gets implemented until they're settled.

### Q1 — The parked mockups: target or superseded?
There is an owner-provided mockup set on record as the **target look**: purple/dark, bolt
logo, 5-tab bottom nav with Ask AI + a centre FAB, priority badges, "Top Priority" grouping.
It was explicitly marked *do not implement until told*.

That direction **conflicts with the shipped "Ember on Ink" identity** (warm orange, no tab
bar). Both cannot be true. Which wins?

**Research position:** the shipped ember direction is *validated* — Cron proves `#0f0d0a` +
one orange is a premium combination. The purple mockups would throw away an identity that
research says is already right. **Recommend: ember wins; harvest the mockups for structure
(priority badges, "Top Priority" grouping) but not for palette.**

### Q2 — Do the 5 accent themes stay?
Ember / Iris / Ocean / Forest / Rose are user-switchable today. A product that lets users
repaint its accent cannot own a colour.

**Research position:** both primary references forbid it. Cron: *"Do not introduce additional
vivid chromatic colors."* Warp: *"Never introduce additional chromatic colors — a second hue
breaks the terminal-inspired restraint."* **Recommend: collapse to ember alone.** The
`themed()` mechanism stays (it's load-bearing and harmless); the *picker* goes.

### Q3 — Mascot: yes, and where?

**Research position: yes, and the job is empty states.** Every dark-mode iOS empty state
reviewed (Klarna ×2, Oku, Telegram, District, SeatGeek) uses the same stack: illustration →
heading → one support line → one button. PostHog proves a disciplined tool can carry a
character without becoming childish, provided it stays *explanatory, contained, never
full-bleed*. SaveHere has four natural homes: no saves, nothing due, no search results,
nothing to rediscover. **Recommend: mascot in empty states + onboarding only — never chrome,
never decoration.**

### Q4 — Sequencing
12 screens is too much for one PR. Preferred: one PR per slice (foundations → core objects
→ screens), or one large branch reviewed once at the end?

### Q5 — Nav model  ← **the one that changes the most work**
Today: Home ↔ Library toggle plus a header trio. The mockups imply a 5-tab bottom bar.

**Research position:** essentially every iOS app reviewed uses a persistent bottom tab bar
(YouTube Music 4-tab, Netflix, SeatGeek 5-icon, Rise, Asana). SaveHere's Home↔Library toggle
driven by a hidden session flag is genuinely unusual — and it already produced two real bugs
this month (Home landing in the library; Library landing on the greeting).

But this is a **UX change, not a re-skin**, and the brief said "don't change functionality".
It needs an explicit yes. **Recommend: yes — a 5-tab bar (Home · Library · Save · Slate · Ask)
replaces the toggle**, because the toggle is the root cause of a class of navigation bugs and
no amount of restyling fixes it.

### Q6 — "New task" bar → floating action button?
Every iOS task app reviewed uses a bottom-right FAB. SaveHere's full-width bar permanently
occupies a strip of screen. **Recommend: FAB.** Small change, well-evidenced, frees real estate.

---

## 10. Research status

**Unblocked.** The Refero MCP tools loaded after the restart; §8 is the result. The skill's
first non-negotiable — *"Research before design work"* — is satisfied, and every row of the
§8.5 ledger traces to a named source rule rather than taste.
