# Shipping ads in the free tier — safely

Owner decision (2026-07-29): the free tier earns **individual Pro actions** by
watching a rewarded ad — "Watch an ad to create this workout" on the button
itself. Not banners, not interstitials.

Read alongside [`../TODO.md`](../TODO.md) (release gate) and
[`../site/privacy.html`](../site/privacy.html) (the policy that must stay true).

---

## Phase 0 — The economics that shape the design

| | Per action |
|---|---|
| Claude Haiku 4.5 call (workout / recipe / itinerary) | **−$0.006 to −$0.008** (~3k in @ $1/MTok, ~900 out @ $5/MTok) |
| Rewarded video, US | **+$0.01 to +$0.03** |
| Rewarded video, India | **+$0.002 to +$0.006** |

**In India, an ad-unlocked AI action is net negative.** In the US it clears
roughly 2–3×. `[eCPM figures are estimates; the ordering is not]`

Two consequences the rest of this plan is built around:

1. **A hard daily cap on ad-unlocks is not optional.** Uncapped, this is an
   unbounded subsidy in your primary market *and* it replaces the Pro
   subscription it's supposed to sell. One Pro subscriber at ₹149 is worth
   thousands of rewarded views.
2. **Treat it as a sampler, not a tier.** The free user gets a taste of the Pro
   feature, then hits the cap with the upsell right there. That is the whole
   point of the mechanism.

**Cap: 2 ad-unlocks per user per day.** One is too stingy to change behaviour;
three starts to feel like a free plan.

---

## Phase 0.1 — Decisions, locked

| Decision | Choice | Why |
|---|---|---|
| Network | **Google AdMob** via `react-native-google-mobile-ads` | Only ad SDK with a maintained Expo config plugin, free UMP consent SDK, and **server-side verification** — which this design requires. |
| Format | **Rewarded video only** | Opt-in, no UI pollution, ~10× the eCPM of a banner. |
| Banners / interstitials | **None** | A banner earns pennies and taxes every user; an interstitial on the save flow damages the pipeline the quality bar protects. |
| Personalization | **Non-personalized only** | No IDFA → no ATT prompt, no "Data Used to Track You" label, no CPRA "sharing" opt-out. Lower eCPM, but see below — the cap bounds the upside anyway. |
| Who sees the offer | **Free tier only.** Never `pro`, never `trial`, never before tier is known | Offering a paying user an ad to unlock what they already paid for is the PRO-lock flash bug with a worse punchline. |
| Which actions | Workout, recipe/tasks, itinerary — the derived actions currently Pro-gated | Ask-your-library stays Pro-only: it's the flagship, and it's the least ad-shaped (no single button moment). |
| Cap | **2 unlocks/day**, server-enforced | See above. |
| Reward grant | **Server-side verification (SSV)** | See Phase 2.2. A client-asserted "I watched it" is free unlimited Pro. |

### Why AdMob policy likes this design

Rewarded ads must be **user-initiated**, with the reward described **before**
the ad plays. Your button — "Watch an ad to create the workout" — *is* that
required opt-in prompt. This is the format's intended use, not a workaround.

Apple permits rewarded video for in-app benefits; it is ubiquitous on the store
and is not a Guideline 3.1.1 issue, because no real-world goods or currency
change hands. `[Certain]`

---

## Phase 1 — Accounts and prerequisites (no app code)

1. **Apple Developer Program** ($99/yr) — already the top blocker in TODO.md.
2. **AdMob account** — register the app, complete **tax and payment details**
   (payouts stall silently without them), create **one iOS rewarded ad unit**,
   and enable **server-side verification** on that unit with your callback URL.
3. **`app-ads.txt`** — AdMob crawls it at the **root** of the developer website
   on your App Store listing. Our pages live at `leoprasanna.github.io/savehere/`,
   so the crawler looks at `leoprasanna.github.io/app-ads.txt` — a path this repo
   does not control. Either create a `leoprasanna.github.io` repo, or buy the
   domain (~$12/yr, which also fixes the support/marketing URLs). Without a valid
   file, most programmatic demand won't bid.
4. **A native build must exist.** `react-native-google-mobile-ads` has native code
   and cannot run in Expo Go. `eas.json` already has a `development` profile with
   `developmentClient: true` — that build has to work before any ad code can be
   tested. **This is the critical path.**

---

## Phase 2 — Implementation

Verify every Expo API against <https://docs.expo.dev/versions/v56.0.0/> first
(see `mobile/AGENTS.md`).

### 2.1 Backend: ad credits (do this first — it's the load-bearing part)

The mobile app can't be trusted to say an ad was watched, and the server already
returns 403 for Pro-gated actions on the free tier. So the server needs a way to
know a real ad completed.

**New table `ad_credits`** — one row per user per UTC day, mirroring `ai_usage`:

```
user_id | day | earned | spent
```

**New endpoint `POST /api/ads/reward`** — called by **Google**, not by the app:

- Public route (no user JWT). AdMob SSV signs each callback; verify the
  signature against Google's rotating public keys before granting anything.
  An unverified callback grants nothing and returns 200 so Google stops retrying.
- `user_id` arrives via the SSV `custom_data` param, set by the client when it
  loads the ad. Validate it's a real user.
- `transaction_id` is the idempotency key — Google retries, and a replayed
  callback must not mint a second credit.
- Refuse past the daily cap (`earned >= AD_CREDITS_DAILY_MAX`, default 2).

**Entitlement change** — in the Pro-gated routes (`routes/workout.py` and
friends), when `entitlements_for()` denies a free user, try
`spend_ad_credit(db, user)` before returning 403. If it succeeds, proceed. The
AI action still calls `charge_ai_action()` as normal — the ad buys past the
*feature* gate, not past the daily AI quota.

Keep this atomic and race-safe the same way `app/quota.py` already is; two
concurrent taps must not spend one credit twice.

**`GET /api/account/usage`** gains `ad_credits: {earned, spent, limit}` so the UI
can render "1 free unlock left today" without guessing.

### 2.2 Why server-side verification, concretely

Without SSV the only alternative is the app calling something like
`POST /api/ads/watched` after the ad closes. Anyone with a proxy can call that
endpoint directly and unlock every Pro feature forever — the server has no way to
distinguish it from a real completion. SSV moves the claim to a signed
Google→server callback the client can't forge.

Google's callback fires when the user **finishes** the ad. Grant on the callback,
never on the client's `onAdDismissed`.

### 2.3 Mobile: consent before initialization — order is load-bearing

Once, at app start:

1. `AdsConsent.requestInfoUpdate()`
2. `AdsConsent.loadAndShowConsentFormIfRequired()` — a no-op outside EEA/UK
3. **only then** `mobileAds().initialize()`
4. Request every ad with the non-personalized flag set

Initializing before the consent step is the mistake that makes a CMP integration
non-compliant while looking like it works. Required for EEA/UK traffic by
Google's EU user consent policy regardless of personalization.

### 2.4 Mobile: the unlock button

One hook, `useAdUnlock()`, is the only thing in the app that knows about ads.

**Preload.** A rewarded ad takes 2–10s to fetch. Load it when the reel detail
screen mounts, not when the button is tapped — otherwise the user stares at a
spinner and assumes it's broken.

**Button states, all of them:**

| State | Button says |
|---|---|
| Pro / trial | "Create workout" (no ad, never) |
| Free, tier not loaded yet | Disabled, neutral label — **never guess** |
| Free, credits left, ad ready | "Watch an ad to create the workout" |
| Free, credits left, ad still loading | "Watch an ad…" + spinner, tappable (shows the ad when ready) |
| Free, **no fill** | "Ads unavailable right now — try again later, or go Pro" |
| Free, daily cap hit | "Free unlocks used up today · **Go Pro** for unlimited" ← the upsell moment |
| Ad watched, generating | Existing generating state |

**No-fill is not an edge case.** Rewarded fill in India is materially worse than
in the US; the button must degrade to a clear message and an upsell, never hang.

Set `custom_data` to the Supabase user id on every ad request — that's how the
SSV callback identifies who to credit. Set `maxAdContentRating` to match the App
Store age rating, and child-directed / under-age-of-consent tags to **false**
(the app requires 13+; mis-tagging is an AdMob policy violation).

### 2.5 Never QA against production ad units

Google's test ad unit IDs in dev and TestFlight, switched by build profile.
Clicking or completing your own live rewarded ads during testing is invalid
traffic — that gets AdMob accounts **terminated with earnings forfeited**, not
warned.

---

## Phase 3 — Legal and store metadata (same release as the SDK)

Not before — publishing these early makes the policy wrong in the other direction.

1. **`site/privacy.html`** — five statements become false and must be rewritten:
   the "short version" card, "We do not sell your data or share it for
   advertising", §2's "No advertising identifiers… no App Tracking Transparency"
   paragraph, and §4's "we have no advertising partners". Then **add** an
   Advertising section: the free tier can watch optional ads served by Google
   AdMob; ads are non-personalized; what Google receives (IP, coarse device and
   app info, for delivery, frequency capping and fraud prevention); a link to
   Google's privacy policy; and that SaveHere Pro removes the need for them.
   Add Google/AdMob to the subprocessor table.
2. **`site/index.html`** — "no advertising and no third-party analytics" is false;
   replace with the honest version.
3. **`site/terms.html`** §6/§7 — describe the ad-unlock mechanic and its daily cap,
   and list ad-free (unlimited derived actions) among what Pro unlocks.
4. **App Privacy questionnaire** — add the AdMob disclosures. Third-party SDK
   collection is declared as **ours**. Under NPA, "used for tracking" stays **No**;
   enabling personalization later flips that answer and makes an ATT prompt
   mandatory.
5. **Paywall copy** — "No ads, unlimited workouts and recipes" as a Pro benefit.

---

## Phase 4 — Pre-submission verification

- [ ] Pro and trial accounts **never** see an ad offer — including the first
      frames after a cold start on a slow network.
- [ ] Free account: unlock works end to end, and the feature actually unlocks.
- [ ] **Credit is granted only by the SSV callback** — calling the reward
      endpoint directly without a valid signature grants nothing.
- [ ] Replaying the same `transaction_id` grants **one** credit, not two.
- [ ] Cap holds: the 3rd unlock attempt in a day is refused **by the server**,
      not just hidden by the UI.
- [ ] No-fill / airplane mode: clear message, no hang, no crash, upsell shown.
- [ ] EEA locale (VPN or device region) shows the UMP form before any ad request.
- [ ] No ad request fires before consent resolves — confirm in the network log.
- [ ] Ads are non-personalized in the request payload.
- [ ] Test ad unit IDs are **not** in the production build; production IDs are
      **not** in the dev build.
- [ ] `app-ads.txt` resolves at the developer website root.
- [ ] `site/privacy.html`, the App Privacy labels, and the shipped binary all
      describe the same behaviour.
- [ ] Save → extract → summarise success rate is unchanged with the SDK linked.
      The ad SDK must never sit on that path.

---

## Ordering

Phase 1 → native build → **backend credits + SSV (2.1–2.2)** → mobile (2.3–2.5)
→ Phase 3 → Phase 4 → submit.

Build the backend first: it's the part that can't be bolted on afterwards, and
it's testable without a working ad SDK (curl a signed callback).
