# SaveHere — Production Checklist

Track everything needed before the app is ready for the iOS App Store.
Items are ordered by dependency — complete top sections before bottom ones.

---

## Blockers (app does not work on a real phone without these)

- [ ] **iOS Share Extension** — allows sharing URLs directly from Instagram/YouTube/TikTok into SaveHere. Requires Mac + Xcode + `expo-share-extension`. This is the core feature.
- [~] **Deploy backend** — move off `localhost:8000` to Railway, Render, or Fly.io so real devices can reach the API. **Repo is deploy-ready** (`render.yaml`, env-driven CORS/DATABASE_URL, `$PORT` start, `/health` check) — see [`docs/DEPLOY.md`](docs/DEPLOY.md). Remaining = owner action: connect repo on Render, set `ANTHROPIC_API_KEY`, deploy. Caveats in DEPLOY.md (free-tier cold starts; ephemeral SQLite → Postgres w/ auth; datacenter-IP extraction still needs a proxy).
- [ ] **Switch API URL in mobile** — `mobile/services/api.ts` `BASE_URL` must point to the deployed backend, not localhost.
- [~] **User authentication** — Supabase Auth (email now; Google/Apple later). **Phases 1–4 done:** (1) `@supabase/supabase-js` client; (2) `get_current_user()` verifies ECC/ES256 tokens vs JWKS, no shared secret (`app/auth.py`); (3) `user_id` on `ReelDB` + **every** reels/workout/ask route scoped to the caller with ownership 404s (tasks/exercises owned via parent reel join) — `url` no longer globally unique (per-user dedup), isolation proven by tests; (4) mobile login/signup screen + auth gate in `_layout.tsx` + `Bearer` token injected in `api.ts` + sign-out in ProfilePanel. **Remaining:** Phase 5 per-user AI quota (replaces interim per-IP cap); Phase 6 Postgres in prod (`DATABASE_URL`). Email confirmation is OFF for dev — turn ON before launch. Apple Sign-In required for App Store once social login is added.
- [ ] **Apple Developer account** — $99/year, required to test on real iPhone and submit to App Store.
- [ ] **Production email SMTP** — Supabase's built-in email sender caps at ~2–4/hour ("email rate limit exceeded"), unusable for real signups. Before re-enabling "Confirm email" for launch, wire a custom SMTP under Authentication → Emails → SMTP. Free options: **Brevo** (300/day), **Resend** (3k/mo, best DX), **SendGrid** (100/day). ⚠️ Real prerequisite: a **verified sending domain** (SPF + DKIM DNS records) — so buy the domain first. Dev for now: keep "Confirm email" OFF (no email sent, no limit).

---

## Infrastructure

- [ ] **Migrate SQLite → Supabase Postgres** — SQLite is a local file, not suitable for production with multiple users.
- [ ] **3-environment config** — `dev` (localhost), `test` (LAN/staging), `prod` (deployed). Control via `ENV` variable and corresponding `BASE_URL` in mobile.
- [ ] **HTTPS on backend** — Apple requires all network calls use HTTPS. Railway and Render provide this automatically.
- [x] **CORS lock down** — `main.py` already reads `ALLOWED_ORIGINS` env var; `"*"` in dev, locked list in prod. Set `ALLOWED_ORIGINS=https://yourapp.com` when deploying.
- [x] **Backend health check endpoint** — `GET /health` returns `{"status": "ok"}`. *(Enhanced extraction self-test tracked under Extraction Reliability & Scale.)*

---

## Security & Cost Control

- [~] **Rate limiting** — per-IP sliding-window limits on save/resummarize/ask/tasks/workout (`app/ratelimit.py`). `/api/ask` (the only uncapped AI feature) also has a **per-IP daily cap of 15/day** (`ASK_DAILY_LIMIT`) on top of the 15/min burst guard, to bound worst-case Claude spend. ⚠️ In-memory + per-process (interim): move the store to Redis for multiple instances; replace per-IP with a **per-user daily/monthly AI quota** once auth lands (also the paywall lever — free vs paid limits).
- [x] **Ask-your-library cost reduction** — `librarian.ask_library` now retrieves only the top-15 most relevant saves (term-overlap scoring, title/tags weighted) instead of dumping up to 60 into every prompt — ~3–4x fewer input tokens per ask. With this, the 15/day cap has lots of headroom and could safely be raised to ~30/day. *(Next-level: embeddings-based retrieval for semantic matches.)*
- [ ] **Claude cost cap (console)** — ⚠️ set a monthly spending limit in the Anthropic console. The only *hard* ceiling regardless of code, and the one protecting you today with no auth. **User action — not codeable.**
- [ ] **API key protection** — once auth is added, all API routes should require a valid session token.
- [ ] **Claude cost cap** — set a monthly spending limit in the Anthropic console dashboard.
- [x] **Audio download guard** — `download_audio()` now sets `max_filesize=50MB` (+ 15s socket timeout) so it aborts before pulling an oversized file.

---

## Extraction Reliability & Scale

> The save pipeline is core functionality. These guard its success rate in production.

- [ ] **Bot-detection on datacenter IPs (deploy decision for YouTube/IG)** — saving a YouTube Short fails with "Sign in to confirm you're not a bot" from the Codespace; **Railway/Render/Fly are datacenter IPs too, so deploy does NOT fix this — usually worse.** Fix is architectural: a layered extraction gateway behind one swappable `ExtractorProvider` — (1) cache, (2) client-side oEmbed/OG metadata from the user's IP, (3) server yt-dlp **behind a residential/mobile proxy** (+ cookies/PO-token) for transcripts, (4) managed-API fallback (Apify / transcript API / YouTube Data API v3), (5) async + link-only-now/backfill-later. Residential proxy is the real prod fix (usage-priced — fold into per-user economics). See `docs/CONTEXT.md` §4 "Extraction & bot-detection". **Decide before deploy.**
- [x] **Fast-fail the page fallback (bug)** — fixed: YouTube degrades via oEmbed (title/thumb) instead of regex-parsing the watch page; `_og` rewritten to scan per-`<meta>` (no catastrophic backtracking on 600 KB pages); page fetch bounded (preview UA, max_redirects=3, 8 s); `EXTRACT_TIMEOUT` cut 50→20 s. Bonus: Instagram/FB **captions** now read via the `facebookexternalhit` UA (the ungated link-preview surface).

- [x] **yt-dlp auto-update in production** — `render.yaml` build now force-upgrades yt-dlp every deploy (`pip install -U --no-cache-dir yt-dlp`), and `.github/workflows/refresh-ytdlp.yml` triggers a monthly Render redeploy (cron, free) to pull the latest without a code push. ⚠️ Owner action: add the `RENDER_DEPLOY_HOOK_URL` GitHub secret (from Render → Settings → Deploy Hook) to arm the monthly job; until then it no-ops.
- [x] **Extraction self-test health check** — `GET /health/extract` reports the installed yt-dlp version; `?live=1` runs a real extraction against a known Short and returns `probe_ok` + latency. ⚠️ Still needs wiring to uptime monitoring / alerting in prod.
- [ ] **Caption 429 mitigation at scale** — a single server IP gets rate-limited on YouTube's `timedtext` endpoint under load (saves still succeed via description fallback, but transcripts drop). Decide before scaling: rotating/residential proxies, YouTube Data API v3 for captions, or accept description-only summaries.
- [x] **Extraction cache eviction** — `save_reel` now prunes `extraction_cache` rows older than the 14-day TTL, throttled to once/hour and fail-open (`_prune_cache_if_due`).
- [ ] **Per-platform success-rate monitoring** — log + track save success by platform; alert if YouTube success drops sharply (early warning that yt-dlp broke).
- [ ] **Process pool for hard timeouts** — the thread pool can't kill a truly hung extraction. If hangs recur in prod, move extraction to a process pool so a timeout can terminate the worker.

---

## Mobile — Features

- [ ] **Share Extension (iOS)** — same as blocker above; listed here for implementation tracking.
- [x] **Library auto-refresh while summarizing** — the home grid polls every 4s while any card is `pending` so background summaries appear without a manual reload (pull-to-refresh also available).
- [ ] **Deep linking** — when Share Extension saves a reel, open the detail screen directly (`savehere://reel/{id}`).
- [x] **Pagination / infinite scroll** — `/api/reels` takes `limit`/`offset` + returns full `total`; library grid loads 24/page via FlatList `onEndReached`. Counts (header, Landing, ProfilePanel) use `total`.
- [x] **Server-side search** — `GET /api/reels/search?q=` searches title+tags+summary+notes across the full library. Library screen debounces 400ms and swaps to server results; infinite scroll disabled during search.
- [x] **Offline banner** — non-blocking banner on the library when offline (web `online`/`offline` events) or when a refresh fails (tap to retry); Retry button on the cold "can't reach server" screen.
- [x] **Pull-to-refresh visual polish** — `RefreshControl` now uses accent colors, card background, and "Refreshing…" title (iOS + Android).
- [x] **Empty state illustrations** — already using lucide vector icons (Sparkles, CloudOff); emoji placeholders were already replaced. Search empty state shows the query string.
- [x] **Haptic feedback** — `services/haptics.ts` (web-safe wrapper; native-only, errors swallowed) wired to: save success/failure (`save.tsx`), re-summarize success/failure + delete-confirm warning (`reel/[id].tsx`), and card-delete tap (`ReelCard.tsx`). Web export verified clean.
- [x] **iPad layout** — detail screen content container capped at `maxWidth: 720` and centered.

---

## Mobile — App Store Requirements

- [~] **App icon** — custom Canva icon (violet→pink gradient + bookmark) installed at `mobile/assets/icon.png` + `favicon.png` (1024×1024, no transparency). ⚠️ It has pre-rounded corners; before iOS submission re-export a FULL-BLEED square version (gradient to the edges) so Apple's mask doesn't double-round / show corner artifacts.
- [ ] **Splash screen** — update `mobile/assets/splash-icon.png` to match final brand.
- [ ] **App Store screenshots** — minimum required sizes: iPhone 6.7" (iPhone 15 Pro Max) and iPhone 6.5" (iPhone 14 Plus). At least 3 screenshots each.
- [ ] **App Store description** — written, keyword-optimised, under 4000 characters.
- [ ] **Keywords** — 100-character keyword field for App Store search ranking.
- [ ] **Age rating** — complete the age rating questionnaire in App Store Connect (likely 4+).
- [ ] **Privacy policy URL** — required for any app with network access. Host a simple one-page policy and add the URL to App Store Connect.
- [ ] **Support URL** — a page or email address users can contact for help.
- [ ] **EAS Build setup** — configure `eas.json` with `production` profile, bundle ID (`com.yourname.savehere`), Apple signing certificate and provisioning profile.
- [ ] **TestFlight beta** — distribute to testers via TestFlight before submitting for review.

---

## Backend — Polish

- [x] **Pagination on list endpoint** — `GET /api/reels` now accepts `?limit=N&offset=N`; server also has `GET /api/reels/search?q=` for full-library search.
- [x] **Structured logging** — `logging` configured in `main.py`; extraction/save/cache paths log with levels. *(TODO: add per-request IDs.)*
- [x] **Error monitoring** — Sentry (`sentry-sdk[fastapi]`) wired in `main.py`, guarded by `SENTRY_DSN` (no DSN = no-op, so local/CI untouched). 10% trace sampling, `send_default_pii=False`. ⚠️ Owner action: create a Sentry project, set `SENTRY_DSN` in the Render dashboard to arm it.
- [x] **Background summary (instant save)** — `POST /save` returns as soon as metadata is extracted; the Claude summary runs in a FastAPI `BackgroundTask` (`summary_status`: pending→ready/skipped/failed). **Durability:** orphaned `pending` summaries (in-process task lost on restart/cold-start) are re-enqueued on startup (`recover_pending_summaries`, capped at 25); the detail screen polls and offers a manual retry if it stalls past ~60s.
- [ ] **Whisper local fallback** — for audio-only content with no captions, add local `openai-whisper` library as a free alternative to the OpenAI Whisper API.
- [x] **Apify LinkedIn integration — NOT NEEDED (removed).** Tested `pratikdani~linkedin-posts-scraper`: it runs sync for 60+ s (would block the save path) and costs ~$0.025/post. Verified the existing free `facebookexternalhit` page scrape already returns the **full** LinkedIn post body (~2.5k chars) via JSON-LD with grounded summaries — so Apify added cost + latency for zero benefit. Reverted to page-scrape-only for all platforms.
- [ ] **Alembic migrations** — replace the `ALTER TABLE` try/except hack in `database.py`. Deferred until Postgres migration (auth project) — premature for SQLite dev.

---

## Pricing & Monetization (launch — App Store Connect config, needs Apple Developer account)

> All of this is **App Store Connect / RevenueCat configuration set at launch**, not app code — except the AI-cap pieces, which need the per-user quota (auth project). Apple owns IAP billing, so discounts must use Apple's native offers, not a custom coupon.

- [ ] **Regional (PPP) pricing** — three storefront buckets, not 175 hand-tuned prices:
  - **US / high-income:** ~$4.99/mo, ~$34.99/yr (margin lever)
  - **EU:** ~€5.99/mo, ~€39.99/yr (price up vs US — displayed price is VAT-inclusive, ~20%)
  - **India + PPP-low countries:** **₹99/mo**, **₹799–₹999/yr** (volume lever)
- [ ] **India first-purchase promo** — Apple **Introductory Offer** (pay-as-you-go): **₹59/mo for the first 3 months, then ₹99/mo**, India storefront only, auto-renewing. Apple's required pre-renewal notice = the "ask to renew," handled automatically. Optionally also mint a custom **Offer Code `SAVEHEREFIRST`** for marketing/launch buzz (same ₹59×3 deal). ⚠️ Don't make it 3 months *free* (token cost + abuse) and don't use a non-renewing product (worse retention).
- [ ] **Price ↔ AI-cap pairing rule** — `[Certain]` net revenue per user must stay ≥ their token cost. ₹99 is the lowest price safe at the current 15/day ask cap (even at Apple's 30%). To go lower (₹49–₹79) the India tier needs a **tighter AI cap** (~7–10/day) — requires the per-user, tier-aware quota (auth). Pre-auth the cap is global, so ₹99 is the floor today.
- [ ] **Tiers** — Free (10-day trial + referrals → view-only, 20-reel, no AI), Monthly, Annual (push annual — lower churn, cash upfront). Lifetime: defer for v1, or only with a hard AI cap.
- [ ] **RevenueCat** — manage IAP entitlements + per-territory pricing + promo experiments across iOS/Android.
- [ ] **Apple Small Business Program** — enroll (<$1M/yr) → 15% commission instead of 30%. Materially improves every margin above.

---

## Nice to Have (post-launch)

- [ ] **Android version** — Expo build for Google Play. Share Intent equivalent for Android.
- [ ] **Push notifications** — re-engagement: "You saved 5 reels this week. Ready to review?"
- [ ] **Collections / folders** — group saved items beyond category tags.
- [ ] **Export** — download all saved summaries as PDF or Markdown.
- [ ] **Analytics** — PostHog or Mixpanel (free tier) to understand which features are used.
- [ ] **GDPR / data deletion** — "Delete my account and all data" flow, required for EU users.
- [ ] **Supabase Row Level Security** — enforce per-user data isolation at the database level, not just application level.
- [~] **CI/CD pipeline** — GitHub Actions: backend pytest runs on push/PR (`.github/workflows/ci.yml`). TODO: EAS build on merge to main.
- [~] **Unit tests** — `backend/tests/` (pytest, 66 tests): `normalize_url`, `detect_platform`, `_parse_vtt`, `_og` (+ backtracking-hang regression guard), `_extract_jsonld`, `_weak_title`, `_to_response` coercion, the per-IP rate limiter, task source disclaimers, DB-backed list/pagination/search endpoint tests (in-memory SQLite + TestClient), and mock-based `extract_tasks` cooking-fallback tests. Run with `python -m pytest tests/ -q` from `backend/`. **CI:** `.github/workflows/ci.yml` runs the suite on every push/PR touching `backend/`. TODO: mock-based test for `summarizer.summarize`.

---

## Done

- [x] FastAPI backend with SQLAlchemy + SQLite
- [x] yt-dlp content extraction (YouTube, Instagram, TikTok)
- [x] YouTube auto-caption extraction (VTT, all languages)
- [x] Claude Haiku summarization with quality prompt
- [x] Multi-language caption and summary support
- [x] Re-summarize (max 3 per reel, refuses empty result)
- [x] Auto-saved personal notes (1-second debounce)
- [x] Dark minimal UI with Expo Router
- [x] 2-column responsive grid home screen
- [x] Category filter chips + title/tag search
- [x] Clickable source URL on detail screen
- [x] Delete reel from card (X button) and detail screen
- [x] 10-minute duration guard (rejects long-form video)
- [x] LinkedIn fallback — save link, prompt user to paste text in Notes
- [x] Proper `.gitignore` (excludes `.env`, `*.db`, `node_modules`)
- [x] Extraction reliability rewrite — `process=False` + ios/tv/android clients (~2–4s, no format-selection failures)
- [x] Extraction cache (`extraction_cache` table) — survives reel deletion; re-saving is instant, never re-hits the platform
- [x] Caption 429 handling — fast-fail to description so saves never hang on rate-limited captions
- [x] ThreadPool hardening — 8 workers + bounded `socket_timeout` / `EXTRACT_TIMEOUT` to limit hung-thread blast radius
- [x] Empty-summary guard — skip Claude when there's no real text; honest "couldn't read this" message
- [x] UI/UX redesign — gradient theme, Ionicons, entrance/press animations, glowing FAB
- [x] Animated bot progress on the save screen (honest step labels retained)
- [x] Fixed card delete — sibling overlay so the X deletes instead of opening the reel
