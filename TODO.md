# SaveHere — Production Checklist

Open work only. Everything shipped, decided or closed lives in
[`docs/SHIPPED.md`](docs/SHIPPED.md) — nothing was deleted when this file was
condensed on 2026-09-07, it was moved.

**Current state:** backend live at `https://savehere-api-staging.onrender.com`
(Render free tier, CI-gated auto-deploy from `develop`, `savehere-dev` Supabase +
Postgres). **331 backend tests pass.** Prod is deliberately not deployed — its
service is commented out in `render.yaml`.

| Legend | |
|---|---|
| `[ ]` | not started |
| `[~]` | partially done — the remaining half is stated |
| 🔴 | blocks launch |
| 👤 | needs the owner, not code |

---

## 🔴 Launch blockers

- [ ] 🔴 👤 **Apple Developer account — $99/year.** Gates everything iOS: real-device
  testing, App Store submission, Sign in with Apple, TestFlight. Several items below
  are blocked only by this.
- [ ] 🔴 👤 **Production email SMTP.** Supabase's built-in sender caps at ~2–4/hour
  ("email rate limit exceeded"), unusable for real signups. Wire custom SMTP under
  Authentication → Emails before re-enabling "Confirm email". Free tiers: **Brevo**
  (300/day), **Resend** (3k/mo, best DX), **SendGrid** (100/day). ⚠️ Real prerequisite
  is a **verified sending domain** (SPF + DKIM) — buy the domain first. Dev: keep
  "Confirm email" OFF.
- [ ] 🔴 👤 **Apply `backend/scripts/enable_rls.sql` to the PROD Supabase project**
  (ref `lukmwwcilrjqqtgqbynq`) before the first prod deploy. Needs prod credentials.
  `savehere-dev` was verified closed 2026-08-10 — every table `relrowsecurity` and
  `relforcerowsecurity` true with zero policies, proven from outside with the
  publishable key that ships in the app bundle. Prod has **not** had this applied.
- [ ] 🔴 👤 **Prod deploy prerequisites.** Uncomment the prod service in `render.yaml`,
  set its `sync:false` env vars (**`DATABASE_URL` in EACH service** — unset means
  ephemeral SQLite and silent data loss), including `YOUTUBE_API_KEY`, and enable
  Supabase Pro (free tier pauses after 7 days idle and has no backups).
- [ ] 🔴 👤 **Google OAuth consent screen → "In production".** Code is complete
  (`mobile/services/oauth.ts`). While the screen sits in **Testing**, only listed test
  accounts (max 100) can sign in; everyone else gets "Access blocked: SaveHere has not
  completed the Google verification process". This is independent of EAS distribution —
  a tester can install the APK fine and still be refused at the Google button.
  Publishing should be instant because only `email`/`profile`/`openid` are requested,
  all non-sensitive. ⚠️ **Two traps on that screen:** never click **"Make internal"**
  (restricts sign-in to a Workspace domain, locking out every Gmail tester), and **do not
  upload a logo** (triggers Google's multi-day brand verification — the one way to land
  in review despite non-sensitive scopes). Setup also needs: OAuth client of type
  **Web application** (not Android — the callback is Supabase's URL), redirect URI
  `https://ymclmbmmwtczspnmccsy.supabase.co/auth/v1/callback`, client ID + secret into
  Supabase → Auth → Providers → Google, and `savehere://auth/callback` under Auth →
  URL Configuration. **Cost: none** at any volume this app will see.
- [ ] 🔴 **Sign in with Apple.** Currently a mock. Blocked on the Developer account
  (Services ID + signing key). ⚠️ **Guideline 4.8 binds at iOS review, not on Android** —
  shipping Google-only on Android is fine, but Apple must be wired before the first
  App Store submission.
- [~] 🔴 **Share sheet — Phase B (invisible Android share).** Built 2026-08-13 on
  `feat/android-invisible-share`; **never compiled or run** — no Android SDK on the dev
  box, so it needs an EAS build to confirm. A translucent `ShareActivity` (config plugin
  `mobile/plugins/withInvisibleShare.js` + one Kotlin file) receives `ACTION_SEND`, hands
  the URL to a foreground service and finishes, so the app never flashes.
  ⚠️ Auth uses a **save-scoped share key** (`backend/app/sharekey.py`), not a mirrored
  Supabase token — those expire in ~1h and refreshing from Kotlin would revoke the
  refresh token and sign the user out. ⚠️ `share_key_tier` + `share_key_subject`
  snapshots are load-bearing: without them a Pro user's silent share is entitled as free
  and charges a different daily bucket. ⚠️ Costs a `FOREGROUND_SERVICE_DATA_SYNC`
  declaration in the Play Console at launch.
- [~] 🔴 **Share sheet — Phase A (iOS).** Android done 2026-08-12 (`expo-share-intent@7`
  wired in `mobile/app/_layout.tsx`). iOS needs only a Mac/Xcode build — the package
  covers both platforms. ⚠️ **A native module cannot ship by OTA**: SaveHere appears in
  the share sheet only after the next EAS build is installed.

---

## 🔴 Monetization — required before launch

- [~] 🔴 👤 **RevenueCat.** Manages IAP entitlements, per-territory pricing and promo
  experiments across iOS/Android. **No quota code change needed** — `daily_limit_for()`
  already reads `app_metadata.tier`.
  **The webhook is written but is a SKETCH and is NOT wired** — `app/routes/billing.py`
  exists and is deliberately not registered, because it mints revenue entitlements. Four
  preconditions, all required:
  1. **Mobile must call `Purchases.logIn(supabaseUserId)`** at login. If RevenueCat
     generates an anonymous id, `event.app_user_id` can't be mapped back to a Supabase
     user and the webhook logs a warning and does nothing.
  2. Set `REVENUECAT_WEBHOOK_TOKEN` (plus the existing `SUPABASE_URL` /
     `SUPABASE_SERVICE_ROLE_KEY`). ⚠️ Auth is a shared secret compared constant-time and
     **fail-closed** — an unset token rejects every call, which is the safe default but
     also means it silently does nothing until configured.
  3. Register the router in `app/main.py`.
  4. In RevenueCat: Integrations → Webhooks → point at
     `https://<backend>/api/billing/revenuecat` with the same Authorization value.
  ⚠️ Tier takes effect on the user's **next token refresh (≤1h) or re-login**, not
  instantly — the JWT claim is what `entitlements.py` reads.
- [ ] 🔴 👤 **Apple Small Business Program.** Enroll (<$1M/yr) → 15% commission instead
  of 30%. Materially improves every margin below.
- [ ] 👤 **Two intro prices still unset — deliberately not guessed.** The **USD monthly
  revert price** (₹99→₹120 is a 17.5% discount; the analogue is ~$8.49) and whether the
  **weekly** plans carry an offer at all. A plan without `introMonths` renders the plain
  renewal sentence, which is true for a plan with no offer — so the gap is safe, just
  incomplete. Needed before App Store Connect setup.
- [ ] **Free auto-summary gating — the biggest lever on unit economics.** A 2026-07-24
  cost study put break-even at **~4.2% conversion gated vs ~7.8% ungated**; typical
  freemium conversion is 2–5%, so ungated is likely never profitable. Not implemented.
  Plumbing exists (`failed` → retry is already click-to-generate).
- [ ] **Regional (PPP) pricing** — three storefront buckets, not 175 hand-tuned prices.
- [~] **Tiers — mechanics built, billing pending.** Server-side entitlements
  (`app/entitlements.py`) work; the purchase flow does not exist.
- [~] **Pro paywall — UI only.** `app/pro.tsx` renders; nothing charges.

### ⚠️ Watch item, not a task
**₹99/month does not cover a maxed INR Pro user** and this was accepted knowingly. 20
actions/day at ~$0.004 is ~$2.43/mo worst case; $7 nets $5.95 after Apple's 15% and clears
it ~2.4x, ₹99 nets ~$0.96 and is ~2.5x underwater. ₹99 breaks even at ~8/day. Bounded per
user, with the Anthropic console cap as the hard ceiling. **Before renewing past the
6-month intro, read the real p50/p95 of `ai_usage.count` for INR Pro users.** The fix, if
needed, is a storefront-specific tier (`daily_limit_for` already branches on tier), not a
price edit. Also: **Pro is only 2x the trial's 10/day**, so the upgrade story rests on
*feature* gating, not the cap — first thing to revisit if conversion disappoints.

---

## 🔴 App Store submission

- [ ] 👤 **Screenshots** — iPhone 6.7" and 6.5", minimum sizes.
- [ ] 👤 **Description** — keyword-optimised, under 4000 characters.
- [ ] 👤 **Keywords** — the 100-character search field.
- [ ] 👤 **Age rating** — questionnaire in App Store Connect (likely 4+).
- [ ] 🔴 👤 **Privacy policy URL** — required for any app with network access. Host a
  one-page policy and add the URL.
- [ ] **EAS production profile** — bundle ID, Apple signing certificate, provisioning.
- [ ] 👤 **TestFlight beta** before submitting for review.
- [~] **Support URL** — in-app page done 2026-08-14 (`mobile/app/support.tsx`); the
  public URL is still needed for App Store Connect.

---

## Cost & abuse — open

- [ ] **Cap residential-proxy spend per user.** *(Hard prerequisite of enabling the
  proxy.)* Residential proxies are **bandwidth-priced (~$2–10/GB) with no ceiling in
  code**, and unlike Claude there is no console-level hard cap to fall back on. Mirror
  `app/quota.py` with a `charge_proxy_action`-style atomic, tier-aware counter.
  ⚠️ **The same cap is required for Whisper the moment `OPENAI_API_KEY` is set** —
  the audio fallback (`transcriber.transcribe`, $0.006/audio-min) is dormant today only
  because the key is unset. **Do not set that key without adding the cap first.**
- [~] **Pre-launch security pass.** Prompt-injection containment is done (`is_sensitive`
  is a one-way latch). Remaining: live-model adversarial evals (steering resistance can't
  be unit-tested), `/security-review` on the branch before first deploy, a ZAP baseline
  scan against staging, and one load smoke (~50 concurrent saves).
  Deliberately **not** doing: DDoS self-testing (violates provider ToS — Cloudflare is
  the answer) and a formal pentest (revenue-stage).
- [~] **Per-IP rate limiting.** In-memory and per-process. Redis is **not needed yet** —
  `render.yaml` runs a single uvicorn worker on a single instance, so one bucket is
  correct. Redis becomes required only on horizontal scale. Free options exist then
  (Upstash, Render Key Value), so this is not a cost blocker.

---

## Extraction reliability — open

- [ ] **Bot-detection on datacenter IPs — decide before prod.** Saving a YouTube Short
  fails with "Sign in to confirm you're not a bot" from a datacenter IP, and
  **Render/Railway/Fly are all datacenter IPs, so deploying does not fix it — usually
  worse.** The seam exists: `EXTRACTOR_PROXY_URL` threads a proxy through both yt-dlp and
  the pooled httpx client, **unset by default and free** (byte-for-byte unchanged
  behaviour). The free layers landed first on purpose — negative cache, per-host gating,
  header realism, circuit breaker — so this decision can be made against real block-rate
  data from `/health/extract` rather than a guess. See the spend cap above.
- [ ] **Wire `/health/extract` to alerting in prod.** The endpoint reports yt-dlp version,
  live probe status and per-platform `breakers`. Nothing watches it today.
- [ ] **Process pool for hard timeouts.** A thread pool cannot kill a truly hung
  extraction. Real bounds today are per-operation (`socket_timeout=10`, `retries=1`,
  explicit httpx timeouts, the circuit breaker). Only do this if hangs actually recur.
- [~] **Per-platform success-rate monitoring.** `record_result()` tracks consecutive
  failures and `/health/extract` exposes `breakers`. Still needed: record a success
  *rate*, not just a consecutive-failure count.
- [~] **Caption 429 mitigation.** Per-host semaphore + jitter + pooled client landed.
  The open half is the same residential-proxy decision above.

### Silent-failure audit (2026-09-07) — LOW residue
Four findings fixed in PR #83. Three left deliberately silent:
`extractor.py:326,407` (caption-language loop, `_youtube_oembed`) and `reels.py:1068`
(mark-failed handler, bounded by `recover_pending_summaries()`). All are
graceful-degradation chains — a debug line would cost nothing, but none produce a
**wrong** diagnosis, which is what made the other four worth fixing.

---

## Infrastructure — open

- [ ] 👤 **Region + Cloudflare.** Pick the Render region nearest first users (Singapore
  for India-first) — **effectively unchangeable later**. Once the domain exists, put
  Cloudflare free in front: edge cache for `/api/thumbnail` (already sends
  `Cache-Control: max-age=86400`) and the only realistic DDoS layer. Decision
  2026-07-20: no paid CDN, no multi-instance, no secrets vault until traffic says so.
- [ ] 👤 **Arm the monthly yt-dlp refresh.** Add the `RENDER_DEPLOY_HOOK_PROD` GitHub
  secret; `.github/workflows/refresh-ytdlp.yml` no-ops until then.
- [ ] 👤 **Create the 3 test accounts in `savehere-dev`,** then run
  `python scripts/dev_seed_tiers.py`. ⚠️ Auth users are **per-project** — the seeded
  `trailtieruser`/`freetieruser`/`protieruser` currently live in PROD; recreate in dev
  and consider deleting from prod.
- [~] **CI/CD.** Backend pytest runs on push/PR; mobile typecheck runs separately.
  ⚠️ Deploys gate on **backend CI only** — mobile type errors don't block a backend deploy.

---

## Features — open

- [ ] **Deep linking** — `savehere://reel/{id}` so a share-extension save opens the
  detail screen directly.
- [ ] **To-do reminders** — local notification the evening before / morning of a due date.
- [ ] **Archive as a softer alternative to delete-on-completion.**
- [ ] **Activity grid + streak.** `todos.completed_at` is already recorded, so the data
  exists.
- [ ] **First-run coach-marks** — spotlight add-a-reel, the Library, and Ask in sequence.
- [ ] **Whisper local fallback** — local `openai-whisper` for audio-only content with no
  captions, as a free alternative to the paid API. ⚠️ See the Whisper spend cap above
  before enabling the paid path.
- [~] **Trip itinerary** — backend done; remaining work is mobile.
- [~] **Usage drill-down** — backend `ai_action_log` done; remaining work is mobile.

---

## Design — open

⚠️ **Two directions are recorded and only one is live.** `mobile/constants/theme.ts`
implements **"Contact Sheet"** (achromatic, 0 radius, Inter, full-bleed masonry). The
**"Nocturnal Dimension"** experiment was partly adopted — `gradients.haze` shipped (12
references) — and its capsule tab bar was **closed as not-doing** on 2026-08-10. The
three items below are that experiment's residue. Decide whether to finish or drop them;
if dropped, delete `docs/DESIGN_PROPOSAL.md` too.

- [ ] **Home screen** — Fraunces greeting, filter pill row. *(Haze root already done.)*
  ⚠️ Fraunces was **dropped** on 2026-08-09 to avoid font-loading latency, and `serif`
  now resolves to Inter. This item contradicts that decision — resolve before building.
- [ ] **Verify haze on web + Android.** The whole point of the hybrid is avoiding
  `expo-blur`; confirm the gradient costs nothing on scroll.
- [ ] **Contrast audit** — re-measure `#F7F4EF` on `#101012` and `#101012` on `#E96B34`.
- [~] **Owner visual pass on signed-in screens.** The preview browser has no session, so
  the tab bar, the pinned CTAs, the rebuilt tile, paywall page 02, reel detail, todos and
  the workout screens have **never been seen by a human on a real build**.
- [~] **Screens not recomposed** — `workout/[reelId]` and `workout/session/[reelId]` are
  token-inherited only; `reel/[id]` and `todos` got targeted passes but keep card layouts
  rather than the ruled-row grammar.

---

## Post-launch (not blockers)

- [ ] **Biometric app-lock** (opt-in Settings toggle).
- [ ] **Collections / folders.**
- [ ] **Export** — summaries as PDF or Markdown.
- [ ] **Analytics** — PostHog or Mixpanel free tier.
- [ ] **GDPR data-deletion flow** for EU users. *(Account deletion itself is done,
  including the Supabase Auth record.)*

---

## Deliberately NOT doing — do not resurrect

- **Profile: gender + avatar icon.** Built, then **removed by owner decision** (PR #18).
  It sat in this file as an open task for weeks and would have been rebuilt. Zero
  references remain in the code — verified 2026-09-07.
- **Smart search.** Deleted 2026-08-10, not disabled — `services/search.py`, the endpoint,
  the tests and `searchReels()` are all gone. If it ever returns at a scale that justifies
  it: **embeddings, not the lexical ranker.**
- **Forgot-password.** Blocked on SMTP *and* scoped to email auth, which Apple/Google are
  replacing. It dies with the email path unless email stays a first-class prod method.
- **Prompt caching for the summarizer.** Haiku 4.5's minimum cacheable prefix is larger
  than SaveHere's whole system prompt — it would cache nothing and cost a write.
- **Capsule tab bar + centre FAB restyle.** Closed 2026-08-10. The instruction assumed an
  `app/(tabs)/` directory that has never existed; Home and Library **share the route `/`**
  and are told apart by a session flag, which expo-router's `Tabs` cannot express.
- **DDoS self-testing and a formal pentest.** ToS violation and revenue-stage respectively.

### Closed during the 2026-09-07 condense
- **"API key protection — once auth is added, all routes should require a session
  token."** Its precondition is met and the work is done. Verified: every route in
  `account.py`, `ask.py`, `reels.py`, `todos.py` and `workout.py` carries an auth
  dependency. The three unauthenticated endpoints are deliberate — `/health`,
  `/health/extract` and `/api/thumbnail` (rate-limited and host-allowlisted).
  `billing.py`'s webhook uses a constant-time shared secret instead of a user JWT,
  which is correct for a machine caller.

---

## Rules that bind — do not relearn these

These cost real time already. Full context in [`docs/SHIPPED.md`](docs/SHIPPED.md).

**Testing & CI**
- **Testing locally does NOT prove it works on Render.** YouTube/Instagram bot-block
  datacenter IPs; extraction that works from a residential IP returns title+thumbnail only
  from Render. To validate an extraction fix, **simulate the block** (monkeypatch
  `yt_dlp.YoutubeDL` to raise, stub `_extract_from_page` to `{}`) or read the real row
  from the shared dev DB.
- **CI has no `ANTHROPIC_API_KEY` on purpose.** Mock `summarizer` / `workout_extractor`.
  A test reaching the real client passes locally (your `.env` has a key = a real billed
  call) and fails CI.
- **`/health/extract?live=1`'s `probe_ok` passes on a thumbnail alone** — it is NOT
  evidence that text extraction works.
- `/api/ask` and `/api/ask/stream` share one process-global rate-limit bucket while
  TestClient presents a single IP, so suite-order traffic can 429 unrelated tests. Quota
  and gating fixtures clear `ratelimit._store`.

**Data & environments**
- **Local dev, Codespaces and staging share ONE `savehere-dev` Postgres.** Running things
  locally writes to the database staging serves.
- The app `.env` is at the **repo root**, not `backend/` — the app walks up from `backend/`.
- Use the Supabase **session pooler (:5432)**. Direct is IPv6-only (Render's outbound
  generally isn't); transaction pooler (:6543) breaks prepared statements.
- **Render env vars override config defaults per service** — check the dashboard before
  assuming staging and prod match the code.
- **Render's free tier kills in-flight background tasks** on spin-down, which is why
  `recover_pending_summaries` re-runs the chain on startup.
- **Any new table needs a matching RLS line** in `enable_rls.sql`. `ai_action_log` and
  `todos` each fell into this trap once.
- **A status field lying about content caused two separate bugs.** Any path writing
  `summary_status` must assume another path may be mid-flight.

**Mobile**
- ⚠️ **EAS Free = 15 Android builds per calendar month**, not the 30 an old changelog
  announced. Running out is a wall, not a bill. The auto-trigger is `workflow_dispatch`
  only, on purpose.
- ⚠️ **JS-only changes ship over the air, not as a build:**
  `npx eas-cli@latest update --channel preview -m "what changed"`. Costs no build quota.
  Only native changes (SDK bump, new native module, permissions, anything touching
  `plugins/withInvisibleShare.js`) need an APK.
- `runtimeVersion` is the **`fingerprint`** policy so an update can never land on a native
  build it doesn't match. **Do not change it to `appVersion`** — `expo.version` is a frozen
  `"1.0.0"`.
- `npm run typecheck` uses `--stack-size=16000`; plain `tsc` crashes on the type graph.
  That's expected, not a real error.
- **`EXPO_PUBLIC_*` is inlined at bundle time** — restart `expo start` after changing it;
  a browser refresh keeps the old value.
- `radius.circle` has a **closed list of three sanctioned uses** — category bubbles, the
  tab bar, the auth buttons. Everything else is 0. Add to the list if you extend it.
- The masonry grid traded FlatList virtualization for a ScrollView. Fine for
  tens-to-hundreds of saves; at a few thousand the fix is a **windowed masonry**, not a
  smaller diff.

**Auth**
- ⏰ **The Apple client secret is a JWT that expires — 6 months maximum.** Unlike
  Google's static client secret, which never expires, Apple's must be regenerated. When
  it lapses **Sign in with Apple breaks for every user with no code change and no deploy
  to blame**, which makes it near-impossible to diagnose from the app side. Prefer giving
  Supabase the Team ID / Key ID / `.p8` so it can rotate the secret itself, rather than
  pasting a pre-generated JWT. **Set a calendar reminder at 5 months either way.**
- The Apple signing key `.p8` can only be **downloaded once**. Store it before leaving
  the page; a lost key means generating a new one and reconfiguring.
- The Apple **Services ID** is a separate identifier from the bundle ID
  (`com.savehere.app`) and is what acts as the OAuth client ID for the web flow. Putting
  the bundle ID in that field is the common misconfiguration.

**Shell**
- Backticks inside `git commit -m "..."` get shell-evaluated and silently eat text — use
  `git commit -F <file>`. Git Bash also mangles `git show <ref>:<path>`; prefix
  `MSYS_NO_PATHCONV=1`.

---

## Known limitations — working as intended

- **Audio-only YouTube Shorts** (no description, content only in speech) can't be
  summarized server-side; caption download needs OAuth. The honest "couldn't read this"
  is correct behaviour.
- **Instagram/Facebook on web** can't use the client-side metadata fetch (browser CORS).
  Native only.
- **YouTube Data API** recovers descriptions, not transcripts. 10,000 free units/day;
  `videos.list` costs 1 unit; the extraction cache is keyed by URL globally, so a popular
  link costs one call no matter how many users save it.
- **Free-tier cold starts** — ~50s to wake after 15 minutes idle.
