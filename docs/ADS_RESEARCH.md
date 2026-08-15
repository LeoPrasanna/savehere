# Ads — research, not a plan (2026-08-15)

Owner asked for the **approaches** behind two placements, explicitly *"don't
implement yet"*. This is that research. Nothing here is built.

**Verdict up front: defer. AdMob will not accept the app until it is live in the
Play Store, so placement B cannot be built now even if we wanted it.**

---

## The blocker, first

Google requires an app to be **published and publicly downloadable in a
supported store** before it can serve ads — *"All Android apps must be publicly
available in a supported store"*
([AdMob app readiness](https://support.google.com/admob/answer/10564477)).
Review takes 2–3 days. On top of that, apps created after January 2025 face
**limited ad serving until verified**, and verification needs an
`app-ads.txt` on the developer's own domain
([AdMob getting started](https://support.google.com/admob/answer/15948559)).

The sequence is forced and cannot be compressed:

```
publish → verify ownership → app-ads.txt → 2–3 day review → limited serving → ads
```

None of it can begin pre-launch.

---

## The two patterns the owner named

**Pinterest (library grid).** Promoted Pins are a **native** format: same
width, same masonry flow, same interaction as an organic pin, separated only by
a small "Promoted" label. Density is advertiser-controlled via frequency
targets, not a fixed publisher slot rate
([Tinuiti](https://tinuiti.com/blog/paid-social/pinterest-promoted-pins/)).
No authoritative public figure exists for their in-feed density — treat any
specific number as a guess.

Mechanically our grid could take it: `app/index.tsx` distributes tiles
shortest-column-first, so injecting one is easy. The friction is that AdMob
native ads carry a **mandatory "Ad" badge and AdChoices overlay**, and the
creative's aspect ratio is not ours to choose — which fights `aspectFor()` in
`components/ReelCard.tsx`.

**Truecaller (Ask, quota exhausted).** Their flagship unit is the After Call
Screen, plus true interstitials at app-open and tab transitions. **The
load-bearing detail is that it fires at a moment of *completion*.** Our
quota-exhausted screen is a moment of *refusal*. Putting a full-screen ad in
front of someone who was just told "no" is the worst possible reading of the
pattern.

---

## Rewarded ads — the version that could make sense

Technically supported, and policy-allowed with real constraints: explicit
opt-in, a genuine decline path, no steering copy, and **the reward must be
delivered on completion**
([AdMob rewarded policy](https://support.google.com/admob/answer/7313578)).
That last clause is a compliance trap for us: if the ad completes and our
backend then 429s for an unrelated reason, that is a policy violation, not just
a bug.

**The economics are the problem, and not by a small margin.**

Cost of one Ask, computed from our own code (`librarian.py`: 8,000-char context
cap, `_MAX_TOKENS = 400`, Haiku at $1/$5 per MTok): **~$0.0026 typical,
~$0.0043 worst case**. Derived actions run `MAX_TOKENS = 1500` → ~$0.008–0.010.

| Geo | Revenue / rewarded view | Ask cost | Margin |
|---|---|---|---|
| US / tier-1 | $0.015–0.030 | $0.004 | 4–7× — works |
| Global average | $0.008–0.018 | $0.004 | 2–4× — thin |
| India / emerging, non-gaming | $0.003–0.008 | $0.004 | ~break-even — **doesn't work** |

*(eCPM ranges from published 2026 benchmarks, which skew gaming; non-gaming runs
20–30% lower. Estimated, not measured for our app.)*

**But unit economics are the wrong lens at our scale.** AdMob pays out at a
**$100 threshold**. At 1,000 MAU with 20% watching one rewarded ad a week, that
is ~800 impressions/month ≈ **$8/month** — over a year to get paid once. The
revenue isn't small, it's functionally zero.

---

## What it would cost to build early

- **1–2 EAS builds** out of the 4 remaining this month (see TODO → EAS BUILD
  BUDGET), for revenue that cannot be collected.
- **`react-native-google-mobile-ads` v16.4.0** is the only credible SDK
  (`expo-ads-admob` is long dead). It ships a config plugin so **CNG/prebuild
  works**. ⚠️ But no release note mentions RN 0.86 or SDK 57, its devDeps pin
  around RN ~0.83, and New Architecture support is documented as *partial* —
  RN 0.86 is New-Arch-only. Budget a debugging cycle.
- **Play Console consequences that are not optional:** the Google Mobile Ads SDK
  **auto-merges `AD_ID` into the manifest**, so the Advertising ID declaration
  becomes mandatory or the release is rejected; the data-safety form must
  disclose Device IDs shared with third parties; `docs/PRIVACY_POLICY.html`
  needs a matching rewrite; and EEA/UK/CH traffic legally requires a certified
  **IAB TCF CMP via the UMP SDK**
  ([AdMob](https://support.google.com/admob/answer/13554116)).

---

## Trigger conditions — build ads when ALL THREE hold

1. App is **live in the Play Store** and AdMob status reads **"Ready"** (not
   limited serving).
2. **≥ 2,000 MAU**, or enough rewarded-eligible users to clear ~10,000
   impressions/month — the point where $100 is reachable inside a month.
3. **Geo data in hand.** If usage is predominantly India/emerging markets,
   rewarded ads roughly break even against Haiku token cost and the native
   dependency is not worth carrying.

## Two design corrections for that day

- **Rewarded ads should unlock Pro-gated actions for free users — not top up an
  exhausted quota.** `app/entitlements.py` already says so in a comment
  (*"free users will earn them via rewarded ads later"*). ⚠️ And note the
  cohort problem: post-trial free users **cannot use Ask at all**
  (`can_ask=False`), so today's quota-exhausted Ask screen belongs to trial and
  Pro users — showing ads to a paying user is a churn mechanic.
- **Never as an interstitial after a refusal.** Inline, opt-in, inside the
  existing `quotaBox` in `app/ask.tsx`, beside the "Search your library" CTA.

## The zero-cost move available now

The entitlement gate already exists. **Sell Pro.** If nobody pays for unlimited
AI actions, nobody will watch an ad for one either — and that costs no build,
no SDK and no privacy rewrite to find out.
