 — Context & Decisions (handoff)

> Read this + [`TODO.md`](../TODO.md) at the start of any session. This captures
> *why* things are the way they are — decisions and reasoning that aren't obvious
> from the code alone. The prior chat history and personal memory do **not** travel
> between machines/Codespaces; this file is the substitute.

_Last meaningful update: see git log on `develop`._

---

## 1. What SaveHere is

An **iOS-first (then Android) mobile app** that saves short-form content — Instagram Reels, YouTube Shorts, TikTok, LinkedIn posts, Facebook reels — and:
- generates **AI bullet summaries + tags** (Claude Haiku) on save,
- turns content into **action**: step-by-step recipes / task checklists, and workout plans,
- lets you **search**, **rediscover** older saves, and **ask your library** questions answered from your own saves.

Owner: solo developer, on **Windows**, pre-launch, ~1 real user (the dev). No paying users yet.

## 2. Architecture

```
backend/   FastAPI + SQLAlchemy, SQLite (dev). System Python 3.12.
  app/
    main.py              app + CORS + /health + /health/extract + /api/thumbnail proxy
    config.py            env via python-dotenv + os.getenv (reads .env OR real env vars)
    database.py          ReelDB, TaskDB, WorkoutExerciseDB, ExtractionCacheDB, AiUsageDB (+ ALTER-TABLE migrations)
    ratelimit.py         per-IP sliding-window limiter (burst/anti-loop guard)
    quota.py             per-user DB-backed daily AI quota (enforce_daily_ai_quota, AI_DAILY_LIMIT)
    routes/
      reels.py           save/list/get/delete, notes, category, resummarize; extraction cache + eviction
      workout.py         tasks (AI once) + manual add/edit/delete; workout plans
      ask.py             "ask your library" endpoint (burst guard + per-user quota)
    services/
      extractor.py       yt-dlp (process=False, ios/tv/android clients) + page/JSON-LD fallback
      summarizer.py      Claude Haiku summary + tags
      workout_extractor.py  recipe/task + workout extraction
      librarian.py       ask-your-library; retrieval (top-15 relevant) + Claude
      transcriber.py     audio transcription fallback (OpenAI Whisper; needs ffmpeg)
  tests/                 pytest (27 tests) — pure-function + rate-limit + retrieval

mobile/    Expo SDK 56 + expo-router + React Native (dev on web).
  app/                   index (library), landing(redirect), save, ask, rediscover, help, reel/[id], workout/*
  components/            ReelCard, TaskList, Landing, ProfilePanel, Icon (Lucide), AuroraBackground, BorderBeam, …
  services/api.ts        typed API client; BASE_URL from EXPO_PUBLIC_API_URL || localhost:8000
  constants/             theme.ts, features.ts
```

## 3. Current state — what works

- **Save pipeline**: yt-dlp + caption/description fallback + extraction cache. Card persists instantly in ~2 s; AI summary runs async in a BackgroundTask (`summary_status`: `pending → ready/skipped/failed`). Detail screen polls every 2.5 s.
- **Library**: paginated (24/page, infinite scroll via FlatList `onEndReached`), full `total` count, offline banner (web `online`/`offline` events + error state retry).
- Per-reel **AI caps**: tasks generated **once** then manual add/edit/delete; workout ×3. Resummarize is **uncapped per reel** (2026-07-14) — every run charges the per-user daily AI quota, which is the real ceiling; the per-IP burst guard stops loops. The UI notes the quota cost next to the button.
- **Ask your library** — retrieval-based (only top-15 relevant saves sent to Claude).
- **AI outputs show dual units**: °F/°C, lb/g, cup/ml across all 4 prompts (summary, tasks/recipe, workout).
- **Smart search** (server-side, `app/services/search.py`): tokenized query + stopword stripping, **category** matching, synonym groups (gym ↔ fitness, recipe ↔ cooking), prefix type-ahead, relevance ranking. Lexical on purpose — search fires per keystroke, a Claude call per search would drain the quota. Embeddings = the semantic upgrade path.
- **Safety surfaces**: all disclaimer copy lives in ONE place, `mobile/components/Disclaimer.tsx` (variants: ai / fitness / recipe / ownership / medical). Sensitive (medical/high-stakes) saves are flagged by the summarizer (`is_sensitive`), show the medical disclaimer, and the server refuses tasks/workout generation for them (`routes/workout.py`, 422 before quota charge). A pre-build workout modal sets "generic template, not coaching" expectations.
- Rediscover, Help, landing page.
- Landing: hamburger (☰) opens profile panel; "Ask your library" card shown prominently once ≥3 reels saved; card hidden from panel when shown on landing; "Open my library" below the Ask card.
- Re-summarize button hidden when summary already exists (shown only when summary is empty).
- Editable category, auto-saved notes, link-only bookmarks for login-walled platforms (FB/LinkedIn).
- Per-IP rate limiting incl. daily cap on `/api/ask`; audio download size guard; cache eviction; `/health/extract` self-test.
- 27 pytest tests; `npm run typecheck` and `npx expo export --platform web` both pass.

**Not built yet:** deployment, payments, iOS share extension. (Auth + per-user data ARE built — Phases 1–5 below.)

### Reliability/tier revamp (branch `revamp/reliability-tiers`, 2026-07-09)
SQLite FK enforcement + explicit cascade deletes (no more orphaned tasks/exercises on reel/account delete); the save-time auto-summary now charges the per-user AI quota (was the last uncapped Claude path — over budget the card still saves, summary marked `failed`); workout regeneration no longer destroys the old plan on a failed extraction; thumbnail proxy host check hardened (substring → domain-suffix, https-only, rate-limited); `GET /api/account/usage` powers a mobile AI-usage meter + live tier badge. Full change list, guardrails, and copy-paste prompts for follow-up work: **[`docs/HANDOFF.md`](HANDOFF.md)**.

### Recipe extraction fallback — FIXED (was "highest priority")

The "Could not extract actionable tasks" failure on cooking reels (caption says
"recipe in pinned comment" → no steps) is resolved in `workout_extractor.extract_tasks()`:
when a cooking prompt returns empty tasks it now falls through to `_infer_recipe`
(title/notes-based), and a genuinely un-inferable dish returns `needs_input` →
a friendly 422 asking for a note. Mobile shows this **inline** (`taskError` state +
alert-circle icon in `reel/[id].tsx`), not a `window.alert()`. Locked by
`tests/test_workout_extractor.py` (mock-based, 6 cases covering the fallthrough).

## 4. Key decisions (the "why")

### AI cost & caps
- Model: Claude Haiku `claude-haiku-4-5-20251001`. Pricing **$1/1M input, $5/1M output** `[Certain]`.
- Est. per-ask cost ~**$0.0015** after retrieval (was ~$0.0055 when dumping 60 reels) `[Guessing on tokens]`.
- **Per-user daily AI quota (Phase 5) ✓** — every AI action (ask/tasks/workout/(re)summarize) draws from one **per-user, DB-backed daily budget** keyed on the Supabase user id (`app/quota.py` + `ai_usage` table). Routes call `charge_ai_action(db, user)`. Replaces the old interim per-IP 15/day ask cap: it persists across restarts/redeploys and can't be bypassed by rotating IPs. A per-IP **burst** guard still sits beneath it (anti-loop). Charged *before* the call (a failed gen still cost tokens).
  - **Race-safe:** the charge is a single atomic conditional `UPDATE ... WHERE count < limit` (after an idempotent `INSERT ... ON CONFLICT DO NOTHING`), so concurrent requests can't overshoot the cap — correct on SQLite *and* Postgres, single- or multi-instance.
  - **Tier-aware (the paywall lever):** `daily_limit_for(user)` reads `tier_for(user)` from the JWT's **`app_metadata.tier`** claim (server-set, so a user can't self-upgrade via `user_metadata`). `free` → `AI_DAILY_LIMIT` (30); `pro` → `AI_PRO_DAILY_LIMIT` (100, placeholder). **Remaining owner work:** the RevenueCat/IAP webhook must write `app_metadata.tier="pro"` on purchase, and the pro number gets finalized with pricing — no code change to the quota.
- Rule to never cross: **net revenue per user ≥ their token cost.** Price-down and cap-down are ONE lever.
- **Tier mechanics (2026-07-10, `feat/tier-system`):** `app/entitlements.py` is the single source of truth — effective tier **trial** (10 d server-side clock, 30 AI/day) → **free** (3 AI/day trickle + 20-save cap on new saves; library never locks) → **pro** (100/day, unlimited; JWT `app_metadata.tier` stamped by `scripts/set_tier.py` until the RevenueCat webhook). Trial re-signup abuse contained by hashing the normalized email into `trial_grants` (survives account deletion → re-signup continues the old clock). Accepted residues: fresh emails mint fresh trials (Apple IAP fixes the economics at launch); ≤1 h downgrade lag (token TTL); soft save cap under concurrency.

### Pricing (planned — see TODO "Pricing & Monetization")
- Regional / PPP, three buckets: **US** ~$4.99/mo, $34.99/yr · **EU** ~€5.99/€39.99 (VAT-inclusive) · **India** ₹99/mo, ₹799–999/yr.
- **India first-purchase promo:** Apple **Introductory Offer** ₹59/mo × 3 months → ₹99 (auto-renew; Apple's pre-renewal notice = the renewal ask). Optional marketing **offer code `SAVEHEREFIRST`**. NOT a custom coupon (Apple owns IAP billing) and NOT 3 months free.
- iOS subscriptions **must** use Apple IAP (15% via Small Business Program / 30% otherwise) — can't use Stripe in-app. Manage with RevenueCat.
- "Lifetime" tier: deferred for v1 (unbounded AI-cost liability without a hard cap).

### Auth (in progress — Supabase, asymmetric JWT)
- **Supabase** (auth + Postgres in one; $0 free tier through early launch, ~$25/mo Pro for always-on at launch). Project `lukmwwcilrjqqtgqbynq`. Uses the **new key system**: `publishable` (was anon) + `secret` (was service_role), and **asymmetric ECC/ES256 JWT signing** — so the backend verifies tokens against the public **JWKS** endpoint, no shared secret.
- **Phase 1 (connect) ✓** — mobile `@supabase/supabase-js` client in `services/supabase.ts` (AsyncStorage session); env wiring (`SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_JWKS_URL`, `SUPABASE_SERVICE_ROLE_KEY`); `backend/scripts/check_supabase.py` connectivity check.
- **Phase 2 (verify primitive) ✓** — `backend/app/auth.py`: `get_current_user()` dependency verifies ES256 tokens via cached `PyJWKClient`, returns `AuthUser(id=sub, email)`, clean 401s. 9 offline tests (`test_auth.py`, locally-minted EC keypair — no network in CI).
- **Phase 3 (per-user data) ✓** — `user_id` on `ReelDB` (indexed); `url` no longer globally unique → per-user dedup in `save_reel`. Every route in `reels.py`/`workout.py`/`ask.py` now takes `Depends(get_current_user)` and filters by `user_id`; single-item ops use `_get_owned_reel_or_404` (and task/exercise ownership via a join to the parent reel) → 404 (not 403) on someone else's id. `test_search_api.py` seeds two users and proves isolation (list/get/delete/search don't cross users; unauthenticated → 401).
- **Phase 4 (mobile auth) ✓** — `contexts/AuthContext.tsx` (session + `onAuthStateChange`); `components/LoginScreen.tsx` (email/password sign-in/up); auth gate in `app/_layout.tsx` (spinner→login→app); `api.ts` `request()` injects `Authorization: Bearer` from `supabase.getAccessToken()`; sign-out in ProfilePanel. **Dev:** email confirmation OFF (turn ON before launch).
- **Phase 5 (per-user AI quota) ✓** — `app/quota.py` `enforce_daily_ai_quota` + `ai_usage` table; one daily budget across all AI actions, env-tunable `AI_DAILY_LIMIT` (30/day); replaces the interim per-IP ask cap. See "AI cost & caps" above.
- **Remaining:** Phase 6 Postgres in prod via `DATABASE_URL`. Keep SQLite for local dev.

### Extraction & bot-detection (datacenter IP) — the prod risk
- **Symptom (2026-06-23):** saving a YouTube Short from the Codespace fails with `[youtube] …: Sign in to confirm you're not a bot`. yt-dlp is current (2026.06.09) — **not** staleness. `[Certain]`
- **Root cause:** YouTube (and IG/TikTok) bot-block requests from **datacenter IP ranges**. Codespaces, **Railway, Render, Fly.io all run on datacenter IPs**, so deploying does NOT fix this — usually **worse** (those ranges are more abused/flagged than GitHub's). It's about **IP reputation + missing PO token/cookies**, not dev-vs-prod. `[Likely]`
- **Decision — layered "extraction gateway", fragile bits isolated behind one swappable `ExtractorProvider`, with graceful degradation:**
  1. **Cache** (exists) — never re-hit the platform.
  2. **Client-side metadata** — app/share-ext grabs oEmbed + OpenGraph (title/desc/thumb) from the *user's* residential/mobile IP. Free, clean distributed IPs, enough for many summaries. No transcript.
  3. **Server yt-dlp behind a residential/mobile proxy** (+ cookies + PO-token plugin), ONLY when a transcript is wanted. Proxy/vendor swappable via env. **The real prod fix.**
  4. **Managed-API fallback** — Apify (we already carry `APIFY_API_KEY`), a transcript API, or YouTube Data API v3 (metadata only) — when self-host extraction fails.
  5. **Async + link-only-now / backfill-later** — never block the request on this path; retry off the request path.
- **Cost:** residential proxies are usage-priced (permanent line item; `[Guessing]` ~$tens/mo early) — fold into the per-user economics rule.
- **Bug found same day:** when yt-dlp is blocked, `_extract_from_page`'s DOTALL regex over YouTube's ~1 MB HTML effectively hangs to the 50s `EXTRACT_TIMEOUT` instead of failing fast. Skip/bound the page-parse for YouTube + degrade gracefully. Violates quality-bar #1.
- **Key win (2026-06-23): the ungated link-preview surface needs a crawler UA.** Instagram/Facebook serve the public `og:` caption (the text that unfurls in iMessage/Slack) **only to recognized preview bots** — a normal browser UA from a server IP gets the login wall. Fetching `_extract_from_page` with UA `facebookexternalhit/1.1` returns the **full caption** (e.g. a whole recipe) even from a datacenter IP, no auth/proxy. So IG/FB **captions are readable** for free; only the video/transcript stays gated. yt-dlp still fails on IG (that's the player API) — the caption comes from the page meta. Implemented in `extractor._PREVIEW_HEADERS`. (Two parser bugs fixed alongside: `_og` catastrophic backtracking on 600 KB minified HTML → scan per-`<meta>`; and missing `DOTALL` dropped multi-line captions.)
- **Async save (2026-06-23):** `/save` now persists the card with `summary_status='pending'` and returns in ~2 s; a FastAPI BackgroundTask runs Claude (and the slow audio fallback) off the request path, flipping to `ready`/`skipped`/`failed`. Detail screen polls; `/api/reels/{id}/summarize` retries. `EXTRACT_TIMEOUT` cut 50→20 s. **Run uvicorn WITHOUT `--reload`** — the reloader's child process dodges `pkill -f uvicorn`, leaving a zombie holding port 8000 (the recurring "Can't reach the server").

## 5. Known gotchas / constraints
- **Windows dev**; line endings show LF→CRLF warnings (harmless).
- **YouTube/IG bot-block on datacenter IPs** — extraction fails from the Codespace **and will fail on Railway/Render/Fly** (all datacenter IPs). Needs a residential proxy / managed API in prod — see §4 "Extraction & bot-detection". Biggest prod reliability risk for the core feature.
- Rate limiter is **in-memory + per-process** — fine for one instance; needs Redis for multiple.
- DB is **SQLite** (single file) — not for multi-user prod; migrate to Postgres with auth.
- Mobile dev is on **web**; native device testing needs EAS/Mac (deferred).
- In a Codespace, the browser's `localhost:8000` does NOT reach the container backend — set `EXPO_PUBLIC_API_URL` to the forwarded backend URL (see `docs/REMOTE_DEV.md`).
- Audio transcription needs **ffmpeg** installed (optional path).

## 6. Next steps (recommended order)
0. **Fix recipe extraction fallback** — `workout_extractor.py` `extract_tasks()` + mobile error UX (see §3 "Pending fix"). One-file backend change + one-function mobile change.
1. **Set the Anthropic console monthly budget cap** (owner action — the only hard cost ceiling today).
2. **Auth + per-user data** (Supabase): users table, `user_id` everywhere, per-user filtering, per-user AI quota. *Largest pure-code unlock; enables tiers/referrals/quota.*
3. **Deploy backend** (Railway/Render) + point `EXPO_PUBLIC_API_URL` at it + lock CORS + Postgres. Repo is deploy-ready (`render.yaml`, env-driven CORS/DATABASE_URL, `$PORT` start, `/health` check) — owner action: connect repo, set `ANTHROPIC_API_KEY`.
4. **iOS share extension** (needs Mac/EAS) — the core capture gesture.
5. **Server-side search** — `GET /api/reels/search?q=` (title+tags+summary+notes) for full-library queries vs current client-side-over-loaded-page approach.
6. Pricing/IAP config in App Store Connect (intro offer, offer code, regional prices) — at launch.

See [`TODO.md`](../TODO.md) for the full, categorized checklist.
