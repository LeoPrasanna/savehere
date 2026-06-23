# SaveHere — Production Checklist

Track everything needed before the app is ready for the iOS App Store.
Items are ordered by dependency — complete top sections before bottom ones.

---

## Blockers (app does not work on a real phone without these)

- [ ] **iOS Share Extension** — allows sharing URLs directly from Instagram/YouTube/TikTok into SaveHere. Requires Mac + Xcode + `expo-share-extension`. This is the core feature.
- [ ] **Deploy backend** — move off `localhost:8000` to Railway, Render, or Fly.io so real devices can reach the API.
- [ ] **Switch API URL in mobile** — `mobile/services/api.ts` `BASE_URL` must point to the deployed backend, not localhost.
- [ ] **User authentication** — currently all saves share one global database. Every user must have their own data. Use Supabase Auth (email, Google, Apple Sign-In).
- [ ] **Apple Developer account** — $99/year, required to test on real iPhone and submit to App Store.

---

## Infrastructure

- [ ] **Migrate SQLite → Supabase Postgres** — SQLite is a local file, not suitable for production with multiple users.
- [ ] **3-environment config** — `dev` (localhost), `test` (LAN/staging), `prod` (deployed). Control via `ENV` variable and corresponding `BASE_URL` in mobile.
- [ ] **HTTPS on backend** — Apple requires all network calls use HTTPS. Railway and Render provide this automatically.
- [ ] **CORS lock down** — change `allow_origins=["*"]` to your actual frontend domains for production.
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
- [ ] **Fast-fail the page fallback (bug)** — when yt-dlp is bot-blocked, `_extract_from_page`'s DOTALL regex over YouTube's ~1 MB HTML hangs to the 50s `EXTRACT_TIMEOUT` instead of erroring in ~5s. Skip/bound the heavy page-parse for YouTube and degrade gracefully (link-only save). Violates quality-bar #1 (graceful, fast failure).

- [ ] **yt-dlp auto-update in production** — schedule `pip install -U yt-dlp` (monthly cron, or a rebuild/redeploy step). YouTube changes regularly break older yt-dlp; this is the single biggest ongoing factor in save success rate. **Do not ship without an update mechanism.**
- [x] **Extraction self-test health check** — `GET /health/extract` reports the installed yt-dlp version; `?live=1` runs a real extraction against a known Short and returns `probe_ok` + latency. ⚠️ Still needs wiring to uptime monitoring / alerting in prod.
- [ ] **Caption 429 mitigation at scale** — a single server IP gets rate-limited on YouTube's `timedtext` endpoint under load (saves still succeed via description fallback, but transcripts drop). Decide before scaling: rotating/residential proxies, YouTube Data API v3 for captions, or accept description-only summaries.
- [x] **Extraction cache eviction** — `save_reel` now prunes `extraction_cache` rows older than the 14-day TTL, throttled to once/hour and fail-open (`_prune_cache_if_due`).
- [ ] **Per-platform success-rate monitoring** — log + track save success by platform; alert if YouTube success drops sharply (early warning that yt-dlp broke).
- [ ] **Process pool for hard timeouts** — the thread pool can't kill a truly hung extraction. If hangs recur in prod, move extraction to a process pool so a timeout can terminate the worker.

---

## Mobile — Features

- [ ] **Share Extension (iOS)** — same as blocker above; listed here for implementation tracking.
- [ ] **Deep linking** — when Share Extension saves a reel, open the detail screen directly (`savehere://reel/{id}`).
- [ ] **Pagination / infinite scroll** — `GET /api/reels` returns all records. Add `limit`/`offset` and FlatList `onEndReached` for large libraries.
- [ ] **Offline banner** — detect no network and show a non-blocking banner instead of silently failing.
- [ ] **Pull-to-refresh visual polish** — current refresh spinner is functional but unstyled.
- [ ] **Empty state illustrations** — replace emoji placeholders with proper SVG artwork.
- [ ] **Haptic feedback** — on save success, delete confirm, re-summarize complete.
- [ ] **iPad layout** — grid is responsive (4 columns on wide screens) but detail screen needs max-width container.

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

- [ ] **Pagination on list endpoint** — add `?limit=20&offset=0` query params to `GET /api/reels`.
- [x] **Structured logging** — `logging` configured in `main.py`; extraction/save/cache paths log with levels. *(TODO: add per-request IDs.)*
- [ ] **Error monitoring** — integrate Sentry (`sentry-sdk[fastapi]`) for automatic exception capture.
- [ ] **Background task for extraction** — `POST /save` currently blocks the HTTP request for 5–15 seconds. Move extraction + summarization to a background worker (Celery or FastAPI `BackgroundTasks`) and poll for completion.
- [ ] **Whisper local fallback** — for audio-only content with no captions, add local `openai-whisper` library as a free alternative to the OpenAI Whisper API.
- [ ] **Apify LinkedIn integration** — use `APIFY_API_KEY` to call the Apify LinkedIn Post Scraper, bypassing the login wall.
- [ ] **Alembic migrations** — replace the current `ALTER TABLE` try/except hack in `database.py` with proper Alembic migration files.

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
- [ ] **CI/CD pipeline** — GitHub Actions: run Python tests on push, EAS build on merge to main.
- [~] **Unit tests** — `backend/tests/` (pytest, 27 tests): `normalize_url`, `detect_platform`, `_parse_vtt`, `_weak_title`, `_to_response` duration/null coercion, the per-IP rate limiter, and task source disclaimers. Run with `python -m pytest tests/ -q` from `backend/`. TODO: mock-based test for `summarizer.summarize` + a CI step.

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
