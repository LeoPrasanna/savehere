# SaveHere — Production Checklist

Track everything needed before the app is ready for the iOS App Store.
Items are ordered by dependency — complete top sections before bottom ones.

---

## ▶ CURRENT FOCUS (2026-07-25) — staging is live; open decisions below need the owner

**Backend is deployed and healthy: https://savehere-api-staging.onrender.com**
(Render free tier, auto-deploys from `develop`, `savehere-dev` Supabase + Postgres.)
225 backend tests pass. Env separation, the Render blueprint, and the extraction
work are all DONE — see the shipped list below.

**Deploys are CI-gated.** Render `autoDeploy` is OFF; `.github/workflows/ci.yml`
fires the Render deploy hook only after backend tests pass. `RENDER_DEPLOY_HOOK_STAGING`
is set, so merging to `develop` auto-deploys. Prod is deliberately NOT deployed —
its service is commented out in `render.yaml` (a paid plan forces a credit card at
Blueprint apply). See [`docs/ENVIRONMENTS.md`](docs/ENVIRONMENTS.md) and
[`docs/DEPLOY.md`](docs/DEPLOY.md).

### ⚠️ Open decisions — need the owner, don't guess

1. **Tier caps were discussed but NEVER applied.** Owner proposed Pro **25**/day,
   Trial **10**/day, Free **3**/day. `config.py` still ships `AI_DAILY_LIMIT=30`
   (trial), `AI_PRO_DAILY_LIMIT=100`, `AI_FREE_DAILY_LIMIT=3`. Decide, then change.
2. **Ask-unlock threshold mismatch.** Code uses `ASK_MIN_REELS = 3`
   (`mobile/components/Landing.tsx`); the 2026-07-20 decision said **5**. It now
   ALSO drives the home screen's state ladder, so the two must be one number.
3. **Free auto-summary gating — the biggest lever on unit economics.** A cost
   study (2026-07-24) put break-even at **~4.2% conversion with free auto-summary
   gated vs ~7.8% without**; typical freemium conversion is 2–5%, so ungated is
   likely never profitable. Not implemented. Plumbing exists (`failed` → retry is
   already click-to-generate).
4. **Pricing not set.** Study recommended **₹149/mo · $5.99/mo · €6.99/mo**. ₹99 is
   underwater — it barely covers a pro user's own AI cost, leaving nothing for the
   free-tier drag. Pro's 100/day cap is too generous at these price points (~15–25/day
   suggested). Details in "Pricing & Monetization" below.

### Recommended next steps, in order

1. **Confirm the YouTube fix in the real app** — save a Short and check the summary
   appears WITHOUT a reload. If it still needs one, next suspect is the 60s polling
   cap in `mobile/app/reel/[id].tsx` (24 tries x 2.5 s), which a cold free-tier
   instance can exceed.
2. Apply the tier-cap decision (#1 above).
3. Implement free auto-summary gating (#3) — the economics lever.
4. **Native/EAS dev build.** Instagram/Facebook summaries rely on the client-side
   metadata fetch, which only works on native (browser CORS blocks it on web), so
   IG/FB still degrade on the deployed backend until a native build exists.
5. Owner creates the 3 standing test accounts in `savehere-dev`, then run
   `python scripts/dev_seed_tiers.py`.
6. **Before any prod deploy:** uncomment the prod service in `render.yaml`, set its
   `sync:false` env vars (incl. `YOUTUBE_API_KEY`), apply
   `backend/scripts/enable_rls.sql` to the PROD Supabase project (it now includes
   `ai_action_log` **and `todos`**), and enable Supabase Pro.
7. ⚠️ **Right after the to-do list deploys to staging: re-run `enable_rls.sql`
   against `savehere-dev`.** The migration creates the `todos` table with RLS
   **off**, and Supabase exposes every table over PostgREST to the publishable
   key that ships inside the app bundle — so until the script is re-run, anyone
   with that key can read and rewrite every user's to-dos. The script is
   idempotent, so just run the whole thing again. This is the same trap that
   `ai_action_log` fell into: **any new table needs a matching RLS line.**

### Shipped 2026-07-21 → 07-25 (PRs #11–#20, all merged)

env separation + prod service deferred (#11/#12) · deploy docs (#13) · client-side
metadata fetch for IG/FB (#14) · AI usage drill-down, honest AI disclaimer, no charge
for impossible AI actions (#15) · **extraction cache poisoning fix + summaries hidden
behind `skipped`** (#16) · search typo tolerance, category/search conflict, Home nav,
removed itinerary rebuild (#17) · library-first home + recent carousel + emoji profile
pictures, gender feature removed (#18) · **YouTube Data API v3 fallback** (#19) ·
summary no longer needs a page reload (#20).

### Gotchas that already cost real time — do not relearn these

- **Testing locally does NOT prove it works on Render.** YouTube/Instagram bot-block
  datacenter IPs; extraction that works from a residential IP returns title+thumbnail
  only from Render. To validate an extraction fix, SIMULATE the block (monkeypatch
  `yt_dlp.YoutubeDL` to raise, stub `_extract_from_page` to `{}`) or read the real row
  from the shared dev DB.
- **`/health/extract?live=1`'s `probe_ok` passes on a thumbnail alone** — it is NOT
  evidence that text extraction works.
- **Render's free tier kills in-flight background tasks** on spin-down, so
  `recover_pending_summaries` re-runs the whole chain on startup.
- **A status field lying about content caused TWO separate bugs.** Any path writing
  `summary_status` must consider that another path may be mid-flight. Reels holding a
  summary but a non-`ready` status now self-heal on startup.
- **Local dev, Codespaces and staging share ONE `savehere-dev` Postgres** — running
  things locally writes to the same database staging serves.
- **CI has no `ANTHROPIC_API_KEY` on purpose.** Tests must never make live AI calls;
  mock `summarizer` / `workout_extractor`. A test reaching the real client passes
  locally (your `.env` has a key = a real billed call) and fails CI.
- Bash: backticks inside `git commit -m "..."` get shell-evaluated and silently eat
  text — use `git commit -F <file>`. Git Bash also mangles `git show <ref>:<path>`;
  prefix `MSYS_NO_PATHCONV=1`.

### Known limitations (working as intended, not bugs)

- **Audio-only YouTube Shorts** (no description, content only in speech) can't be
  summarized server-side — caption download needs OAuth. The honest "couldn't read
  this" is correct behaviour.
- **Instagram/Facebook on web** can't use the client-side fetch (browser CORS). Native only.
- **YouTube Data API** recovers descriptions, not transcripts. 10,000 free units/day;
  `videos.list` costs 1 unit; the extraction cache is keyed by URL globally, so a
  popular link costs one call no matter how many users save it.

---

## Blockers (app does not work on a real phone without these)

- [ ] **iOS Share Extension** — allows sharing URLs directly from Instagram/YouTube/TikTok into SaveHere. Requires Mac + Xcode + `expo-share-extension`. This is the core feature.
- [x] **Deploy backend — DONE (2026-07-24).** Live at **https://savehere-api-staging.onrender.com** (Render free tier, CI-gated auto-deploy from `develop`, `savehere-dev` Postgres + auth). Prod service is deliberately commented out in `render.yaml` until launch. Walkthrough in [`docs/DEPLOY.md`](docs/DEPLOY.md). Live caveats: free-tier cold starts (~50 s to wake after 15 min idle); `DATABASE_URL` is load-bearing — unset on a Render service means ephemeral SQLite and silent data loss; and YouTube/Instagram bot-block the datacenter IP, which is why extraction leans on the YouTube Data API and the client-side fetch rather than a proxy.
- [x] **Switch API URL in mobile — DONE.** `EXPO_PUBLIC_API_URL` drives it (`mobile/services/api.ts`); `mobile/.env` and the `eas.json` build profiles point at the staging URL. ⚠️ `EXPO_PUBLIC_*` is inlined at bundle time — restart `expo start` after changing it, a browser refresh keeps the old value.
- [~] **User authentication** — Supabase Auth (email now; Google/Apple later). **Phases 1–4 done:** (1) `@supabase/supabase-js` client; (2) `get_current_user()` verifies ECC/ES256 tokens vs JWKS, no shared secret (`app/auth.py`); (3) `user_id` on `ReelDB` + **every** reels/workout/ask route scoped to the caller with ownership 404s (tasks/exercises owned via parent reel join) — `url` no longer globally unique (per-user dedup), isolation proven by tests; (4) mobile login/signup screen + auth gate in `_layout.tsx` + `Bearer` token injected in `api.ts` + sign-out in ProfilePanel. **Phase 5 done:** per-user, DB-backed daily AI quota (`ai_usage` table + `app/quota.py` `enforce_daily_ai_quota`) shared across all AI actions (ask/tasks/workout/(re)summarize), env-tunable `AI_DAILY_LIMIT` (default 30/day), replacing the interim per-IP ask cap. **Remaining:** Phase 6 Postgres in prod (`DATABASE_URL`). Email confirmation is OFF for dev — turn ON before launch. Apple Sign-In required for App Store once social login is added.
- [ ] **Apple + Google sign-in (staging/prod; replaces email there — decided 2026-07-20)** — Supabase social providers; email auth stays enabled in **dev only**. ⚠️ Apple guideline 4.8: offering Google **requires** Sign in with Apple, and Apple sign-in needs the Apple Developer account below — hard dependency. Win: dropping email auth removes the SMTP/sending-domain blocker for signups (see "Production email SMTP" — auth no longer needs it). Caveat: trial-continuity hashes the email; Apple "Hide My Email" relays are stable per app, but revoke+re-auth mints a new relay → fresh trial (accepted residue — IAP raises the cycling cost). Owner setup: Google Cloud OAuth client + consent screen; Apple Services ID + signing key.
- [ ] **Apple Developer account** — $99/year, required to test on real iPhone and submit to App Store.
- [x] **Delete the Supabase Auth user on account deletion** — `DELETE /api/account` now wipes the user's data AND deletes the Supabase Auth record via the Admin API (service-role key), so the account truly ceases to exist (Apple 5.1.1(v)). Failures are reported honestly (`auth_deleted:false` + "contact support" message), never a fake success; the admin call can't 500 the wipe. Mobile signs out with `scope:'local'` (the server session is already dead after admin deletion — a server sign-out used to fail and made successful deletions LOOK broken) and errors are now visible on web too (`Alert.alert` is a silent no-op in react-native-web). Locked by tests (mocked admin call).
- [ ] **Production email SMTP** — Supabase's built-in email sender caps at ~2–4/hour ("email rate limit exceeded"), unusable for real signups. Before re-enabling "Confirm email" for launch, wire a custom SMTP under Authentication → Emails → SMTP. Free options: **Brevo** (300/day), **Resend** (3k/mo, best DX), **SendGrid** (100/day). ⚠️ Real prerequisite: a **verified sending domain** (SPF + DKIM DNS records) — so buy the domain first. Dev for now: keep "Confirm email" OFF (no email sent, no limit).
- [~] **Password strength on signup** — **client UX DONE (2026-07-20):** `LoginScreen` requires ≥8 chars to sign up (was 6), with a live 3-segment strength meter (length-first per NIST 800-63B — encourages variety, doesn't force composition rules). ⚠️ **This is UX only and trivially bypassable** — anyone can call the Supabase signup API directly. **The real enforcement is owner action in the Supabase dashboard:** Authentication → Policies → set minimum length to 8+ AND enable **leaked-password protection** (HaveIBeenPwned check) — the latter blocks `password123`-class passwords far better than any composition rule. ⚠️ Scope reality: this only matters for the **email** path, which is dev-only going forward (Apple/Google own the password in staging/prod, see above). Kept because beta testers use email auth in the interim.
- [ ] **Forgot-password — DEFERRED, not built (decided 2026-07-20)** — declined for now on purpose. Two blockers make it low-value work right now: (1) it needs **email delivery** — `supabase.auth.resetPasswordForEmail` sends a reset link, which hits the exact SMTP blocker above (Supabase's built-in sender is unusable for real volume), plus a reset-token deep-link/redirect page to build; (2) it's an **email-auth-only** concept, and email auth is being replaced by Apple + Google in staging/prod, both of which own their own account recovery. So it's blocked on SMTP *and* scoped to a being-removed feature. Revisit only if email auth is kept as a first-class prod method; otherwise it dies with the email path.

---

## Infrastructure

- [~] **Migrate SQLite → Supabase Postgres** — **code DONE + verified against real Postgres (2026-07-21):** `psycopg2-binary` added, `pool_pre_ping=True` on the engine, `DATABASE_URL` declared in `render.yaml` (`sync:false`), and Alembic replaces the ALTER hack (below). Verified against the live Supabase pooler (PostgreSQL 17.6, ap-south-1, session pooler :5432): connection OK, `alembic upgrade head` created all 8 tables with correct types (`is_sensitive`=boolean, `itinerary`/`summary`/`tags`=json — the exact things the old hack broke on Postgres), an ORM round-trip persisted+read JSON/boolean, and the app boots on Postgres (`/health` 200, migrate-on-startup a no-op). **Remaining = owner/deploy:** set `DATABASE_URL` (session pooler) in the Render dashboard at deploy; keep local dev on SQLite (leave it unset in the root `.env`) so local test data stays. Supabase Pro for prod (free tier pauses after 7d idle, no backups). ⚠️ **Original data-loss blocker still applies until the Render env var is set:** on SQLite, Render's ephemeral disk wipes the DB on every redeploy. Original audit gaps (all now addressed):
  1. **No Postgres driver** — `psycopg2-binary` is absent from `requirements.txt`; SQLAlchemy cannot connect at all today.
  2. **`DATABASE_URL` is not declared in `render.yaml`** — so a deploy silently falls back to `sqlite:///./savehere.db` on the ephemeral disk. Add it as `sync: false`. This gap IS the data-loss scenario.
  3. **`create_tables()`'s `ALTER TABLE … except: pass` loop breaks on Postgres** — see the Alembic item below.
  4. **Use the Supabase POOLER connection string, not the direct one** — direct connections are IPv6-only and Render's outbound generally isn't, which surfaces as confusing connection errors. Supavisor pooler = IPv4. Also add `pool_pre_ping=True` to the engine so stale pooled connections don't appear as random 500s.
  **No data migration needed:** leave `DATABASE_URL` unset locally → SQLite for dev; set it in staging/prod → Postgres, starting clean (local rows are test data). Decision 2026-07-20: **staying on Supabase Postgres for prod** — auth is already there, `enable_rls.sql` is Supabase-shaped, one vendor/one bill. Cost: free tier is fine for dev/staging but **pauses after 7 days idle and has no backups**, so production needs Pro ($25/mo). ⚠️ Owner action: put the pooler URL in the **repo-root `.env`** (NOT `backend/.env` — the app loads the root `.env` by walking up from `backend/`) yourself — never paste it into chat, it contains the DB password.
- [x] **Environments: Dev / Staging / Prod — DONE (2026-07-21..24; decided 2026-07-20, no PreProd)** — **Both Supabase projects now exist (2026-07-21):** `SaveHere` = PROD (ref `lukmwwcilrjqqtgqbynq`, ~27 real auth users incl. the seeded test accounts — keep clean), `savehere-dev` = DEV/STAGING (new, empty). Target shape: **dev** = `savehere-dev` Postgres (session pooler :5432) + `savehere-dev` auth (SQLite retired 2026-07-21 for Codespaces persistence — local shares the staging DB); **staging** = same `savehere-dev` Postgres + auth, 2nd Render service auto-deploying from `develop`; **prod** = `SaveHere` Postgres + `SaveHere` auth, Render (Starter+) from `main` + Supabase Pro. Each deployment gets its OWN env-var values (12-factor — no code branching). Mobile: EAS build profiles carry `EXPO_PUBLIC_API_URL` + `EXPO_PUBLIC_SUPABASE_*` per env (dev build → `savehere-dev`). PreProd skipped: with one developer, staging IS preprod. **Ordered next steps** (branch `chore/env-separation`): **Phase A DONE (no secrets):**
(1) ✅ reverted local root `.env` `DATABASE_URL` → SQLite (data back, `/health` 200);
(2) ✅ env matrix documented in [`docs/ENVIRONMENTS.md`](docs/ENVIRONMENTS.md) (+ cross-links
in DEPLOY/CONTEXT); (5) ✅ mobile per-env structured in `mobile/eas.json` (prod values baked;
dev/staging = `REPLACE_*` placeholders, publishable so git-safe); (6) ✅ `render.yaml` split
into `savehere-api-staging` (←`develop`) + `savehere-api-prod` (←`main`), and the missing
`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` runtime-auth vars added to each (were absent — a
deployed backend's auth would have broken). **Phase B — MOSTLY DONE (owner supplied dev secrets):**
(3) ✅ `savehere-dev` Postgres stood up: `alembic upgrade head` + `enable_rls.sql` applied, all 8
app tables enabled+forced (fixed: `ai_action_log` was missing from the RLS script); (4) ✅ local
`.env` + `mobile/.env` + `eas.json` pointed at `savehere-dev`. **Decision 2026-07-21: SQLite
RETIRED for local dev** — local runs on the `savehere-dev` pooler now (Codespaces persistence);
the 49 local reels were migrated + re-owned to a dev account (43 after dup-URL collapse); the
SQLite-guarded dev scripts (`dev_tier.py`/`dev_seed_tiers.py`) re-guarded to savehere-dev-only.
**Remaining:** owner creates the 3 test accounts in `savehere-dev` → run `dev_seed_tiers.py`;
stand up Render staging+prod services (owner sets each service's `sync:false` vars — ⚠️
`DATABASE_URL` in EACH); apply RLS + the `ai_action_log` fix to PROD before first prod deploy. **Gotchas:** auth users are PER-PROJECT (the seeded `trailtieruser`/`freetieruser`/`protieruser` are in PROD — recreate in dev, consider deleting from prod); the app `.env` is at the REPO ROOT not `backend/`; use the session pooler (:5432) not direct (IPv6) or transaction (:6543, breaks prepared statements); pro tier = JWT `app_metadata.tier` (≤1h cache, needs re-login), trial/free = local profiles clock.
- [ ] **Region + Cloudflare free (deploy-time decisions)** — pick the Render region nearest first users (Singapore for India-first) — effectively unchangeable later; once the domain exists, put Cloudflare free in front: free edge cache for `/api/thumbnail` (already sends `Cache-Control: max-age=86400`) and the only realistic DDoS layer. Decision 2026-07-20: **no paid CDN, no multi-instance, no dedicated secrets vault** until real traffic data says otherwise — secrets live in Render env groups (per-env) + Supabase config + GitHub Actions secrets; the Redis note under rate limiting is the multi-instance prerequisite.
- [ ] **HTTPS on backend** — Apple requires all network calls use HTTPS. Railway and Render provide this automatically.
- [x] **CORS lock down** — `main.py` already reads `ALLOWED_ORIGINS` env var; `"*"` in dev, locked list in prod. Set `ALLOWED_ORIGINS=https://yourapp.com` when deploying.
- [x] **Backend health check endpoint** — `GET /health` returns `{"status": "ok"}`. *(Enhanced extraction self-test tracked under Extraction Reliability & Scale.)*

---

## Security & Cost Control

- [x] **Per-user AI quota (the real cost ceiling + paywall lever)** — worst-case Claude spend is bounded by a **per-user, DB-backed daily quota** (`app/quota.py` + `ai_usage` table; routes call `charge_ai_action(db, user)`), shared across **every** AI action (ask/tasks/workout/(re)summarize) and keyed on the Supabase user id. Replaces the old per-IP 15/day ask cap; survives restarts/redeploys and can't be bypassed by rotating IPs. **Race-safe:** the charge is a single atomic conditional `UPDATE ... WHERE count < limit`, so concurrent calls can't overshoot (correct on SQLite *and* Postgres, multi-instance). **Tier-aware:** `daily_limit_for(user)` reads the tier from the JWT's server-set `app_metadata.tier` claim — `free`→`AI_DAILY_LIMIT` (30), `pro`→`AI_PRO_DAILY_LIMIT` (100, placeholder). ⚠️ Remaining = owner/launch: the RevenueCat/IAP webhook must write `app_metadata.tier="pro"` on purchase + finalize the pro number (no quota code change).
- [~] **Per-IP rate limiting (burst guard)** — per-IP sliding-window burst limits remain on save/resummarize/ask/tasks/workout (`app/ratelimit.py`) as an anti-loop guard beneath the per-user quota. ⚠️ In-memory + per-process: move the store to Redis for multiple instances (the quota itself is already DB-backed + atomic, so it's multi-instance-safe today). **Decision 2026-07-20: Redis is NOT needed yet** — `render.yaml`'s `startCommand` runs a single uvicorn worker on a single instance, so one in-memory bucket is correct. Redis becomes required only on horizontal scale (each instance would otherwise get its own bucket, multiplying the effective limit by N). Free options exist when that day comes (Upstash, Render Key Value), so this is not a cost blocker. **Test hygiene note:** `/api/ask` + `/api/ask/stream` share one process-global bucket while TestClient presents a single IP — suite-order traffic can 429 unrelated tests, so quota/gating fixtures clear `ratelimit._store`.
- [x] **Ask-your-library cost reduction** — `librarian.ask_library` now retrieves only the top-N most relevant saves (term-overlap scoring, title/tags weighted) instead of dumping up to 60 into every prompt. The per-user quota runs comfortably at 30/day (`AI_DAILY_LIMIT`). *(Next-level: embeddings-based retrieval for semantic matches.)*
- [x] **Ask-your-library streaming + latency trim** — measured the ask wait: retrieval is ~15 ms, the Claude call is the whole cost (TTFT ~1.4 s + generation ~1.9 s). Fixes: (1) `POST /api/ask/stream` streams the answer token-by-token via `librarian.stream_answer` + FastAPI `StreamingResponse` — first words at ~1.4 s instead of a ~3 s wall of silence; sources are computed from the finished answer (`sources_from_answer`, title-mention match) so no JSON envelope blocks streaming; (2) trimmed the prompt (TOP_N 15→12, per-item caps, max_tokens 500→400) — cut input ~35%, lowering TTFT and cost. Mobile uses **XMLHttpRequest** (incremental `responseText` works identically on RN native and web, unlike `fetch`), rendering tokens live with a caret. The non-streaming `/api/ask` stays for compatibility/tests.
- [x] **Claude cost cap (console)** — ✅ monthly spending limit set in the Anthropic console (owner, 2026-07-13). The only *hard* ceiling regardless of code; protects spend even with no auth. *(Was duplicated below — consolidated here.)*
- [ ] **API key protection** — once auth is added, all API routes should require a valid session token.
- [x] **Audio download guard** — `download_audio()` now sets `max_filesize=50MB` (+ 15s socket timeout) so it aborts before pulling an oversized file.
- [x] **Save-time summary charged against the quota (was the last uncapped AI path)** — the auto-summary on `/save` now calls `charge_ai_action` like every other AI action. Over budget → the card still saves instantly, marked `failed` so the detail screen offers a retry after the daily reset. Before this, saving in a loop was unbounded Claude spend (only the per-IP burst guard stood in the way).
- [x] **Thumbnail proxy hardened** — host check is now a domain-suffix match (`ytimg.com.evil.example` used to pass the old substring check → open proxy), https-only, plus a per-IP rate limit (120/min).
- [x] **Rate limiter trusts `X-Forwarded-For` blindly** — fixed: `_client_ip` now indexes from the right past `TRUSTED_PROXY_HOPS` (env, default 1 = one platform LB) instead of taking the client-controlled leftmost entry, so a caller can no longer forge a prefix to dodge the per-IP limit. `TRUSTED_PROXY_HOPS=0` (local/no proxy) never trusts XFF. Locked by `tests/test_ratelimit.py` (spoofed-prefix + distinct-real-client cases).
- [ ] **Thumbnail proxy follows redirects** — a whitelisted CDN redirecting off-domain would still be fetched. Low risk (major CDNs don't), but validating the final host after redirects would close it fully.
- [ ] **Cap residential-proxy spend per user (prerequisite of enabling the proxy)** — the residential proxy for transcript extraction (see "Bot-detection on datacenter IPs") is **bandwidth-priced (~$2–10/GB) with no ceiling in code**. Before turning it on: add a per-user daily cap on proxied extractions (mirror `app/quota.py` — a `charge_proxy_action`-style atomic counter, tier-aware so `pro` gets more), so a loop of YouTube saves can't run up an unbounded bill. Unlike Claude, there is no console-level hard cap to fall back on. ⚠️ **Same cap is required for Whisper the moment `OPENAI_API_KEY` is set** — `_summarize_reel`'s audio-transcription fallback (`transcriber.transcribe`, $0.006/audio-min) is currently dormant (key unset, `sync:false` in `render.yaml`) but uncapped; do not set the key without adding the cap first.
- [~] **Pre-launch security/abuse pass (scoped 2026-07-20)** — **(1) prompt-injection containment DONE (2026-07-20):** `is_sensitive` is now a **one-way latch** (`routes/reels.py`, both set-sites: model may set, never clear) — even a fully steered model reply ("sensitive": false, e.g. via a note or malicious caption) cannot lift the medical containment; summarizer prompt hardened (untrusted text fenced in `<CONTENT>` markers + data-not-instructions rule + "content's claims about its own status don't count"); locked by `tests/test_sensitive.py::TestSensitiveLatch` (steered-model mocks). **Decision (same date): notes-in-resummary KEPT, not removed** — notes are first-party input (self-harm only); the third-party injection vector is the reel caption, which is unremovable; removal would break the cooking-infer fallback, the paste-into-notes recovery path, and user-guided summary correction. The latch closes the only cross-cutting harm deterministically. Remaining: live-model adversarial evals (steering resistance can't be unit-tested), (2) `/security-review` on the branch before first deploy; (3) ZAP baseline scan against staging; (4) one load smoke (hey/locust, ~50 concurrent saves vs staging). NOT doing (deliberate): DDoS self-testing (can't meaningfully self-test, violates provider ToS — the answer is Cloudflare in front), formal pentest (revenue-stage). SQLi: ORM + bound `text()` params already cover it; ZAP confirms.

---

## Extraction Reliability & Scale

> The save pipeline is core functionality. These guard its success rate in production.

- [ ] **Bot-detection on datacenter IPs (deploy decision for YouTube/IG)** — saving a YouTube Short fails with "Sign in to confirm you're not a bot" from the Codespace; **Railway/Render/Fly are datacenter IPs too, so deploy does NOT fix this — usually worse.** Fix is architectural: a layered extraction gateway behind one swappable `ExtractorProvider` — (1) cache, (2) client-side oEmbed/OG metadata from the user's IP, (3) server yt-dlp **behind a residential/mobile proxy** (+ cookies/PO-token) for transcripts, (4) managed-API fallback (Apify / transcript API / YouTube Data API v3), (5) async + link-only-now/backfill-later. Residential proxy is the real prod fix (usage-priced — fold into per-user economics). See `docs/CONTEXT.md` §4 "Extraction & bot-detection". **Decide before deploy.**
- [x] **Fast-fail the page fallback (bug)** — fixed: YouTube degrades via oEmbed (title/thumb) instead of regex-parsing the watch page; `_og` rewritten to scan per-`<meta>` (no catastrophic backtracking on 600 KB pages); page fetch bounded (preview UA, max_redirects=3, 8 s); `EXTRACT_TIMEOUT` cut 50→20 s. Bonus: Instagram/FB **captions** now read via the `facebookexternalhit` UA (the ungated link-preview surface).

- [x] **yt-dlp auto-update in production** — `render.yaml` build force-upgrades yt-dlp every deploy (`pip install -U --no-cache-dir yt-dlp`), and `.github/workflows/refresh-ytdlp.yml` triggers a monthly **prod** Render redeploy (cron, free) to pull the latest without a code push. ⚠️ Owner action: add the `RENDER_DEPLOY_HOOK_PROD` GitHub secret (from Render → savehere-api-prod → Settings → Deploy Hook) to arm the monthly job; until then it no-ops.
- [~] **CI-gated Render deploys (2026-07-21)** — Render `autoDeploy` is now **off** in `render.yaml`; deploys fire only from `ci.yml`'s `deploy` job **after the backend test suite passes** (staging hook on `develop`, prod hook on `main`), so a red build never ships. Gates on backend CI only — mobile type errors don't block a backend deploy (Render runs the backend). ⚠️ Owner action: add GitHub secrets `RENDER_DEPLOY_HOOK_STAGING` + `RENDER_DEPLOY_HOOK_PROD` (each service → Settings → Deploy Hook); until set, CI passes and simply skips the deploy step. Alternative considered + rejected: Render's native "wait for CI" dashboard toggle (no code, but less explicit/portable than the hook).
- [x] **Extraction self-test health check** — `GET /health/extract` reports the installed yt-dlp version; `?live=1` runs a real extraction against a known Short and returns `probe_ok` + latency. ⚠️ Still needs wiring to uptime monitoring / alerting in prod.
- [ ] **Caption 429 mitigation at scale** — a single server IP gets rate-limited on YouTube's `timedtext` endpoint under load (saves still succeed via description fallback, but transcripts drop). Decide before scaling: rotating/residential proxies, YouTube Data API v3 for captions, or accept description-only summaries.
- [x] **Extraction cache eviction** — `save_reel` now prunes `extraction_cache` rows older than the 14-day TTL, throttled to once/hour and fail-open (`_prune_cache_if_due`).
- [ ] **Per-platform success-rate monitoring** — log + track save success by platform; alert if YouTube success drops sharply (early warning that yt-dlp broke).
- [ ] **Process pool for hard timeouts** — the thread pool can't kill a truly hung extraction. If hangs recur in prod, move extraction to a process pool so a timeout can terminate the worker.

---

## Mobile — Design

- [~] **UI/UX overhaul — "Contact Sheet" (branch `design/contact-sheet`, 2026-08-01).**
  Briefed against the **Savee** iOS app (owner-supplied reference), then built from
  a different source so it shares Savee's *thesis* without copying its *execution*.
  Full reference lock sits at the top of `mobile/constants/theme.ts`.
  ⚠️ **This is the FOURTH direction in a week** (Cron Calendar restraint → Sticker
  Bomb → Golden Hour → this). The previous branch `design/loud-rebrand` was deleted
  as instructed; its 5 commits are preserved under the tag **`archive/loud-rebrand`**
  (`git show archive/loud-rebrand`). Delete the tag if you want them truly gone.
  **Why this one is different, and worth stopping on:** SaveHere's cards are
  THUMBNAILS. Every previous direction put brand colour on the surface *around*
  them, and colour-vs-thumbnail is a fight the chrome always loses. This system's
  governing rule — from Julia Krantz, "colour is entirely absent from the UI layer;
  all chromatic interest is delegated to the photography" — is the first one that
  matches what the product actually shows.
  **Research (Refero):** primary **Julia Krantz** (darkroom contact sheet: absolute
  #000, 1px ghost-line seams, 0 radius, weight-300 display type). Borrowed: **mono**
  (ghost outline control — no filled colour CTAs) and **entire studios** (small
  tracked uppercase labels as the metadata voice). Savee's own screens + its 13-step
  onboarding flow supplied the JOURNEY, not the styling.
  **Deliberate departures from Savee** (so this isn't a clone): ghost outline CTA
  instead of its filled white pill · square auth buttons and avatars instead of its
  circles · a numbered `01 / 06` rail instead of its dot pagination (whose active
  dot is also its only spot of colour) · weight 300 instead of its medium/semibold ·
  fully achromatic chrome, where Savee keeps a blue accent.
  **Done:**
  - **Token layer rewritten.** Absolute #000 / #FFF canvases — never a "near"
    value. One foreground tone, one muted, one ghost line. **Every radius is 0**
    (`radius.full` included, so ~30 pill/avatar call sites went square unedited).
    **No shadows** (`shadow.*` are empty objects). Gradients flattened to solid
    fills — `scrim` is the one exception and keeps real stops, because it makes
    overlay text legible over an unknown photograph.
  - **⚠️ `app.json`'s `userInterfaceStyle` was `"dark"`** — that forces
    `Appearance.getColorScheme()`, so light mode could never have worked on a
    device. Now `"automatic"`. Both schemes verified live in the browser.
  - **Accent themes deleted** (5 ember/iris/ocean/forest/rose swatches). An
    achromatic system has no accent to switch. Replaced by **Light / Dark /
    System**, inline in ProfilePanel — a whole route for one three-way choice was
    never worth the tap.
  - **Colour-carried meaning re-encoded, not dropped.** Priority marks (to-dos,
    home widget) are now SHAPE — solid / hollow / hairline. Disclaimer severity is
    a stated heading ("NOT MEDICAL ADVICE") plus border weight. Platform is a
    tracked wordmark, not a coloured badge. Progress meters are discrete marks
    rather than filled bars. Each of these is *more* accessible than what it
    replaced: red-vs-amber was never distinguishable to a red-green colourblind
    reader, and those are the notices that matter most.
  - **Grid is full-bleed and flush** — no page margin, no gutters; tiles share a
    1px seam, contact-sheet style. Frames are 3:4 portrait (was 16:10 landscape,
    which cropped the top and bottom off nearly every reel thumbnail stored).
  - **Two-step auth**, following Savee's flow: welcome (wordmark + auth choice over
    an empty contact sheet) → form. Apple/Google are deliberately ABSENT rather
    than present-and-dead; the row is built so they drop in when wired.
  - **Onboarding** recomposed full-bleed: title, copy, a monochrome geometric
    figure, numbered rail, pinned CTA. No skip (2026-07-20 decision preserved).
  - Retired glassmorphism layer **deleted** (Aurora/BorderBeam/Shimmer/
    ParticleField/LibraryBackdrop/GlassCard) — still mounted and still painting the
    old ember palette. New `components/kit.tsx` primitive set. Fredoka+Fraunces →
    **Space Grotesk + DM Sans**. Icon strokes thinned 2.4/2/1.75 → 1.6/1.35/1.1.
  - **Press feedback is opacity, not scale.** `Pressable`'s `scaleTo` is now a
    no-op prop kept for ~30 call sites; a contact sheet whose tiles bounce is a
    contradiction, and at 0 radius a scaling rectangle reads as a glitch.
  - **Bug found and fixed while verifying:** `_layout.tsx` gave `<StatusBar>` and
    the gate's child the same `key={schemeEpoch}`. Sibling keys share a namespace,
    so both were `"0"` — React warned about duplicate children on every render and
    can legally *drop* one. Keys are prefixed now.
  ⚠️ **Contrast note:** the reference's own `#707070` muted tone measures **4.24:1**
  on black and fails AA at the 10px label sizes this system leans on. Both ash
  values were walked until they pass (`#787878` = 4.8:1 dark, `#6E6E6E` = 5.1:1
  light). Preserving an accessibility bug is not preserving a signature trait.
  **Remaining — screens that inherit the tokens but were NOT recomposed:**
  `reel/[id]` and `todos` got targeted passes (whites that would have gone
  invisible on the now-white filled controls, priority marks, hero chips, display
  type) but keep their card-based layout rather than the ruled-row grammar.
  `workout/[reelId]` and `workout/session/[reelId]` are token-inherited only.
  ⚠️ **Owner visual pass required** — the agent's preview browser has no session,
  so only the login/welcome flow and the token layer were verified live. Verified:
  typecheck clean, `expo export --platform web` clean, both schemes paint
  correctly, no console errors.

- [x] **Round two — owner review (2026-08-01).** Six items, all shipped.
  1. **Typeface → Inter, one family.** Space Grotesk + DM Sans at weight 300 were
     dropped for a single neutral Helvetica-class grotesque at 400/500/600, to
     match the brief's reference app. Tracking loosened -0.04em → **-0.025em** at
     display sizes: tight negative tracking exists to stop LIGHT letterforms
     drifting apart, and applied to semibold it jams the counters shut. Four font
     packages uninstalled (space-grotesk, dm-sans, fraunces, manrope) — Inter is
     the only one left.
  2. **⚠️ `<button> cannot contain a nested <button>` — MY BUG, fixed.** Round one
     added `accessibilityRole = 'button'` as a *default* on `components/Pressable`.
     react-native-web renders that as a literal `<button>`, and this component is
     nested inside itself all over the app (a tappable row that also holds
     edit/delete controls — TaskList, TodoEditor, the reel detail hero). Invalid
     HTML, and the inner control stops receiving clicks. The role is now
     undefined by default (RN-web emits a `<div>` with correct ARIA, which nests
     legally) and passed **explicitly** on leaf controls only — `GhostButton`,
     `FilledButton`, the welcome auth button — so screen-reader semantics survive.
     Verified in the DOM: 1 button, 0 nested pairs.
  3. **Category filter → round icon bubbles** with the name beneath, mirroring the
     reference's avatar row. `radius.circle` is added to the token layer as **the
     one sanctioned circle in the system** — grep before reusing it; everything
     else is still 0. Selection inverts (filled bubble, canvas-coloured icon)
     rather than tinting, since there is no accent hue to tint with.
  4. **Library is a staggered masonry**, not aligned rows. Each tile goes to
     whichever column is currently shortest; running height is tracked in
     width-units so columns finish level without measuring anything on screen.
     Tile aspect comes from `aspectFor()` — seeded by **platform** (YouTube and
     LinkedIn serve landscape thumbnails, Instagram and TikTok vertical) plus a
     hash of the reel id, so it is real signal, deterministic, and never reflows
     on image load. ⚠️ **This traded FlatList virtualization for a ScrollView** —
     masonry and row-virtualization are incompatible without measuring every
     tile. Fine for tens-to-hundreds of saves; at a few thousand the fix is a
     windowed masonry, not a smaller diff. `onEndReached` is reimplemented by hand
     on `onScroll`.
  5. **Login backdrop is a live collage of the user's own saves.** New
     `services/thumbCache.ts` persists up to 12 recent thumbnail URLs; the
     signed-out welcome screen renders them as three tilted columns that **drift
     continuously in alternating directions** (odd rise, even fall) at three
     different speeds. First-ever launch has nothing cached and correctly falls
     back to the numbered empty sheet.
     **Why the user's own thumbnails and not stock imagery:** bundled stock is
     someone else's work plus a licence to track; hotlinking is someone else's
     bandwidth and copyright. Their own saves cost nothing, need no licence, and
     are better product — the reference app shows you strangers' content, this
     shows you what you came back for. `clearThumbs()` runs on account deletion.
     ⚠️ **Asked for as a GIF; built in code instead.** No image/video generation
     tool is available in this environment, and a GIF would have been a
     fixed-size, block-compressed asset of someone else's content shipping in
     every bundle forever. The coded version weighs nothing, stays sharp at any
     density, and adapts to the user's library.
     ⚠️ **Respects `AccessibilityInfo.isReduceMotionEnabled()`** — continuous
     unstoppable background motion is exactly what that setting exists for, and a
     sign-in screen is not the place to overrule it.
     ⚠️ Second bug caught here: the first attempt made all three columns drift the
     SAME way. `Animated.add(...).interpolate(...)` was over-clever; replaced with
     a plain from/to swap per direction. Verified in the browser: UP / DOWN / UP.
  6. **No blur on the collage** (the reference blurs its own). `expo-blur` is a
     native module and this project has no dev build yet — the tilt plus a heavy
     scrim carries the same "atmosphere, not content" read. Revisit once a native
     build exists.
  ⚠️ The scrim is the **canvas colour**, not black — it dims the wall in dark
  mode and lightens it in light mode, so the wordmark on top stays legible in
  both. A fixed black scrim would leave black-on-black text in light mode.

- [x] **Round three — welcome screen, no photography (2026-08-01).**
  1. **⚠️ ALL BITMAPS REMOVED FROM THE LOGIN SCREEN.** Owner raised the copyright
     question on the thumbnail collage. The honest resolution is not to reason
     about which images are safe — it is to have none. The tiles are now **mock
     reel cards drawn entirely from Views**: a "REEL" label, a `•••` glyph, a
     tonal well with an outlined play mark, a part-played scrubber, and an action
     row. Nothing depicts anything, so there is no licence to track and no asset
     to ship. Verified in the DOM: **0 `<img>` elements on the screen.**
     *(For the record: the cached thumbnails were never the real exposure —
     showing a user their own saves is what every other screen does. Bundled or
     hotlinked stock would have been, and that was already avoided. Synthetic is
     simply strictly safer AND a smaller diff.)*
     `services/thumbCache.ts` and all its wiring are **deleted** — it existed only
     for this screen.
  2. **The action glyph is a BOOKMARK, not a heart.** This is a saving app; save
     is the verb it cares about. Small detail, but it is the one thing on the mock
     card that says whose product it is.
  3. **Bottom ramp added.** A `LinearGradient` to solid canvas over the lower 58%,
     on top of the flat wash — the controls and legal text live down there and
     were competing with moving tiles. Measured: solid canvas behind the auth row.
  4. **Apple + Google buttons added as MOCKS.** Round one left them out on the
     grounds that a dead button is worse than no button; the owner asked for them,
     so they exist and **say so when tapped** rather than failing silently. Email
     is the one that works and carries the system's inversion (filled) to show it.
     ⚠️ Still blocked on the same two things: the $99 Apple developer account, and
     Apple guideline 4.8 — offering Google *requires* Sign in with Apple, so they
     ship together or not at all.
  5. **Scene compositions in the mock reels** (`components/MockReel.tsx`).
     Asked for as "AI-created reel content"; **no image-generation tool exists in
     this environment**, so photographic frames could not be authored. The honest
     alternative is procedural: six composition kinds — portrait, horizon,
     top-down, product, skyline, title — built from Views and gradients in the
     palette's own tones. At tile size, behind a scrim and drifting, they read as
     a wall of monochrome stills rather than a grid of grey rectangles, and the
     zero-bitmap property from item 1 is preserved exactly.
     **If real photography is ever wanted, the ONLY safe route is licensed assets
     the owner supplies** — a paid stock licence that permits app embedding, or
     shot in-house. Wiring them in is small: give `Scene` an image branch and drop
     files in `assets/`. Do not swap in scraped or hotlinked images.

  **Logged-in screens finally verified (2026-08-02).** A real staging session was
  present in the preview browser, so the screens that had been unverifiable since
  round one were checked live against a 63-save library:
  - Category bubbles render circular (`border-radius: 999px`, 15 of them).
  - **Masonry confirmed staggered**, not aligned rows — measured tile offsets of
    391/451/764 in one column against 551/923/1379 in the next.
  - Paywall page 01 renders, and the **`SAVE 20%` badge appears in USD** (where
    $2/wk = $8.70/mo against $7 is a genuine 20%). The same function returns null
    for the INR pair, so the badge cannot render there — the guard works.
  ⚠️ Still unverified: paywall page 02, reel detail, todos, workout screens.

- [x] **Round five — grid fidelity, floating tabs, pinned CTAs (2026-08-02).**
  1. **⚠️ THE BLACK BARS WERE A BUG, NOT A CROP SETTING.** YouTube's
     `hqdefault.jpg` / `hq2.jpg` are ALWAYS 480×360 (4:3) with pillarbox bars
     **baked into the JPEG** for vertical Shorts — pixels in the file, so no
     `resizeMode` removes them. Worse, `aspectFor` was handing YouTube/LinkedIn
     *landscape* wells, which framed the bars instead of cutting them AND put two
     tile shapes in one grid — the "not consistent" complaint.
     Fixed properly at the source: `thumbCandidates()` in `services/api.ts` asks
     for **`oardefault.jpg`** first, which serves the real 1080×1920 frame with no
     bars (measured live: hqdefault → 480×360, oardefault → 1080×1920). It does
     not exist for every video, so ReelCard walks the candidate list on `onError`
     and falls back to the stored URL. All tile ratios are now portrait.
  2. **The tile IS the image.** The caption block underneath was eating ~40% of
     every tile and turned the wall into a column of black panels. Title and
     category now ride a scrim over the bottom of the picture; 2px gutters
     replace the flush seam, since images running edge to edge with no gap read
     as one continuous smear.
  3. **Floating 5-tab bar** (`components/TabBar.tsx`): Home · Library · **Save**
     (centre, inverted) · Slate · Ask. Rendered ONCE at the root, above the
     router, so it cannot drift between routes. Hidden on `/save`, `/pro` and the
     workout session player — focused tasks with their own primary button, where
     a floating nav would compete and a mis-tap would lose a pasted link.
  4. **Hamburger on every page**, and only one profile panel. `HeaderHomeButton`
     → `HeaderMenuButton` (Home is a tab now, so a header Home button was a
     second way to do one thing). The panel moved to the root and is opened from
     any screen through a 30-line `services/uiBus.ts` — previously **three**
     screens each rendered their own copy with their own state.
     The library header lost home/save/menu buttons and its bottom-docked search
     (the tab bar owns that space; the two stacked left ~120px of permanent
     chrome over the grid). Search moved up under the wordmark.
  5. **CTAs pinned on `/save` and `/pro`.** "Good to know" is eight paragraphs,
     so the Save button sat below the fold — you had to scroll past the small
     print to save anything. On the paywall, five benefit paragraphs sat above
     the price, so **you could not see what it cost without scrolling through the
     sales pitch**. Both now dock: the copy scrolls, the price and the button do
     not move.
  6. **iPhone 16 Pro (393×852)** — verified no horizontal overflow, 2-column grid.
  ⚠️ **Verified this round:** typecheck, `expo export` (all routes), login screen
  at 393×852, zero console errors. **NOT verified — needs an owner pass:** the tab
  bar, the pinned CTAs and the rebuilt tile all require a signed-in session, and
  the preview browser lost its staging token when the dev server restarted.

- [x] **Round six — matching the reference more literally (2026-08-02).**
  1. **Tab bar is a PILL**, icon-only, hugging its contents rather than spanning
     the width. Active state is a filled disc behind the glyph — the system's
     inversion, just round. Labels removed; the fill is a translucent wash
     (`colors.tabBar`, new token) so content stays faintly visible through it,
     which is what makes it read as floating rather than welded to the edge.
  2. **⚠️ THE TILE NOW CARRIES NO TEXT AT ALL.** Third pass on this: caption
     block → scrim overlay → bare picture. Each layer of metadata was the thing
     making a wall of images read as a list of panels. Title, category, platform
     and index are all gone from the grid; they live one tap away on the detail
     screen, which has room for them. The only exception is a still-processing
     save, which has no picture yet and would otherwise be an unexplained grey
     rectangle.
     ⚠️ **The visible × went with them, so delete moved to LONG-PRESS** (plus the
     existing delete on the detail screen). Removing the affordance outright
     would have been a silent functional loss; `Pressable` gained `onLongPress`
     for it. If a visible control is wanted back on the grid, that is a one-line
     revert — but it will cost the clean wall again.
  3. **Auth buttons are round** (`radius.circle`, 68px). They were square on the
     argument that the system is 0-radius everywhere.
  ⚠️ `radius.circle` now has a **closed list of three sanctioned uses** — category
  bubbles, the tab bar, the auth buttons — documented at the token. Everything
  else is still 0, absolutely. Add to that list if you extend it; do not just
  reach for it.
  **Verified:** typecheck, `expo export`, auth buttons measured at 999px/68px on
  a 393×852 viewport. **Still needs an owner pass:** tab bar and library grid,
  both of which require a signed-in session.

---

## Mobile — Monetization

- [~] **Pro paywall — two pages, UI only (2026-08-01).** `app/pro.tsx`: page 01
  lists what Pro unlocks (grounded in gates that exist in the code today) plus the
  plan picker; page 02 is the order summary and card form.
  ⚠️ **PAGE 02 IS A MOCK.** No payment provider is wired up — "Pay" waits a beat
  and reports that nothing was charged. A loud TEST-MODE banner sits above the
  form and **must not be removed before real billing lands**: a payment form that
  looks real and does nothing is how someone types a real card number into a dead
  field. Real billing is StoreKit/Play Billing via RevenueCat (Apple takes its cut
  on digital goods; a raw card form would fail review anyway), whose webhook writes
  `app_metadata.tier = "pro"` — the value `app/quota.py::daily_limit_for` already
  reads, so no quota code changes.
  ⚠️ **THE INR PRICING IS UPSIDE DOWN.** Owner-specified: ₹20/week, ₹120→₹99/month;
  $2/week, $7/month. ₹20/week is **₹86.96/month** at 4.348 weeks — so the ₹99
  monthly plan is the WORSE deal, while the same pair in USD saves 19%.
  `savingPct()` in `constants/pricing.ts` computes the real number and returns
  null when there is no saving, so the UI **physically cannot** render a false
  "SAVE X%" badge. Fix the prices, not the badge: ₹99/mo needs weekly at ~₹30 to
  read as a discount.
  ⚠️ **Still contradicts the cost study** (2026-07-24, see "Pricing & Monetization"):
  it put break-even at ~4.2% conversion and recommended **₹149/mo**, calling ₹99
  "underwater — it barely covers a pro user's own AI cost". If ₹99 ships,
  `AI_PRO_DAILY_LIMIT` (currently 100) has to come down with it or every Pro user
  is a loss. **Owner decision, unresolved.**
  **Remaining:** RevenueCat + StoreKit/Play Billing integration; real restore-
  purchases; server-side receipt validation; the tier webhook.

---

## Mobile — Features

- [ ] **Share Extension (iOS)** — same as blocker above; listed here for implementation tracking.
- [x] **To-do list — the retention surface (2026-07-30)** — a cross-reel list of what the
  user actually meant to do, the thing a bookmarking app needs so saves don't rot unseen.
  **Backend:** new `todos` table + `/api/todos` CRUD + `POST /api/reels/{id}/todo`
  (`app/routes/todos.py`, 17 tests in `tests/test_todos.py`). **Zero AI, zero quota** —
  it's the user's own text, so it adds retention without adding COGS. **Mobile:** dedicated
  `app/todos.tsx` (Overdue / Today / Upcoming / Someday), a reusable `TodoEditor` modal used
  by both entry points, an "Add to to-do list" card on the reel detail screen, and a
  Today/Upcoming preview on the home screen that collapses to one quiet row when nothing is
  due (it never fakes urgency).
  **Three decisions worth not relearning:**
  1. **Not `TaskDB`.** Those rows are recipe steps: `reel_id` is `NOT NULL`, ownership is a
     join to the parent reel, and `routes/workout.py` deletes them wholesale on regeneration
     — todos in that table would appear inside recipe checklists AND get silently wiped.
  2. **Deleting a reel does NOT delete its todo** (`ondelete SET NULL` + an explicit unlink in
     `delete_reel`, since SQLite needs `PRAGMA foreign_keys`). Title/description are *copied*
     at add time, so the todo still reads correctly afterwards. Todos are also swept on
     account deletion — they're owned by `user_id`, so the reel sweep alone would orphan them.
  3. **Due date is OPTIONAL** (owner proposed mandatory). Forcing a date on "I want to try
     this sometime" makes users either abandon the add-flow or type a junk date — and junk
     dates poison the home-screen widget, which is the entire point. Undated items land in
     "Someday" and the widget falls back to a quiet row. One-line change in
     `routes/models/todo.py` if this proves wrong.
  ⚠️ **Not verifiable by the agent:** the logged-in screens need a real session, which the
  preview browser doesn't have. Backend is covered by tests; typecheck + web export pass;
  the date/bucket logic was proven with assertions. **Owner: do a visual pass.**
- [x] **To-do polish → shipped as "Follow Through" (2026-07-30)** — owner round two:
  1. **Named.** `mobile/constants/todoBrand.ts` holds the name, the button labels and the
     quote list. Renaming is ONE edit — nothing hardcodes it. ("Follow Through" names the
     thing users actually fail at; alternates listed in the file.)
  2. **No back-dated tasks.** The calendar disables past days (real enforcement, device
     clock); the server refuses them as a backstop. ⚠️ The server allows **one day of
     slack on purpose** — a user in Honolulu setting "today" sends what is already
     yesterday in UTC, and a strict check would reject every negative-offset timezone.
     Validation also only runs when the date *changes*, or renaming a task that had merely
     slipped past its date would be impossible.
  3. **One open task per save.** `GET /api/reels/{id}/todo` drives a deactivated button on
     the reel screen; completing the task re-enables it (refetched on focus, so completing
     it on the list screen frees the button when you navigate back). Completing a linked
     task now asks **"keep the save or delete it?"** — the previously-declined prompt, built
     as asked. Keep is the primary action and the only thing a stray tap reaches; the
     delete button names what is lost (summary, notes, steps, workout — irreversible).
     The task itself survives either choice.
  4. **Dashboard.** Open / Done / Overdue tiles (Open+Done from server stats, Overdue
     computed locally so it can't disagree with the sections below it) plus rolling
     quotes — reusing `RollingTagline` with a new `lines` prop rather than a second roller.
  5. **Calendar picker.** `components/DatePicker.tsx`, dependency-free. Deliberately NOT
     `@react-native-community/datetimepicker`: another native dep that can't render in the
     web dev loop and looks different per platform. Grid math verified across 84 months
     incl. leap years and the 2100 non-leap trap.
- [x] **To-do round three: goals, settings, side-by-side home block (2026-07-31)**
  1. **Naming split.** The home screen says one steady thing — **"Things on your slate"**;
     the list screen's own hero *rolls* through "My Docket 📜 / My Almanac 🌙 / …"
     (`TODO_ROLL_NAMES`). A rolling name on the home screen would just be noise beside the
     user's actual saves. The nav header on that screen is deliberately blank — the rolling
     hero IS the title.
  2. **Home block is now two columns**, Today | Upcoming. **Overdue folds into Today**
     rather than taking a third column: it *is* today's work, just late, and three columns
     don't survive a narrow phone. Each column is `flex:1` + `minWidth:0` so a long title
     truncates inside its own column instead of shoving the other off the card.
  3. **Completion animation** — the tick springs in, a ring bursts outward, the row eases
     back to 62% opacity but stays readable so tapping again to undo is obvious.
  4. **Daily goal** (default 5, settable 0/3/5/8/10, 0 = off) with a progress bar on both
     surfaces. ⚠️ **The reset is structural, not scheduled:** the new `todos.completed_on`
     column stores the DEVICE's calendar day, so "today" rolls over at the user's own
     midnight. There is no cron to run and nothing that can get stuck showing yesterday's
     number. `completed_at` (UTC) is kept for ordering/audit but is NOT what the goal counts
     — a task finished at 9 p.m. in Los Angeles is stamped the *next* UTC day.
     `stats.completed_today` is `null`, never `0`, when the client didn't say what day it is.
  5. **Settings sheet** (gear on the list screen): daily goal, show-on-home, default
     priority, keep-completed-visible, Someday-first, and **a switch for the
     "delete the saved card?" prompt** — it's the kind of ask that gets old fast.
     Device-local (`services/todoSettings.ts`), not server-side: these are display choices,
     and a round-trip before first paint isn't worth it. Move to `profiles` if sync is asked
     for. ⚠️ Bug caught by its own check: `Number(null)` is `0` in JS, and `0` is meaningful
     here ("goal off") — so a corrupt stored value used to silently switch the goal off
     instead of falling back to the default. Now only real numbers/numeric strings count.
- [x] **To-do UX fixes (2026-07-31)** — four owner reports, all root-caused:
  1. **Home button went to the library, not home.** Not a to-do bug — `goHome()` was
     missing `clearEnteredLibrary()`. The `/` route renders EITHER the landing page or the
     library depending on that session flag, so once you'd opened the library the house
     icon dropped you back there for the rest of the session, from *every* screen.
     `sessionFlags.ts` had documented "Going Home must clear this" all along; the call was
     simply never made. Fixed in `HomeButton.tsx`, so it's fixed app-wide.
  2. **"Done — nice one." was slow.** It was rendered *after* `await api.updateTodo(...)`,
     so a cold Render instance left the user staring at a ticked box for seconds. Now shown
     immediately and dismissed if the update fails. Safe to be optimistic: the prompt only
     *offers* a deletion, which is its own separately confirmed action.
  3. **"My" is now fixed**, with only the name + emoji rolling. Stacked (small "MY" label
     above, big rolling name below) rather than inline — "My Program of Entertainment 🎪"
     on one line does not fit a narrow phone, and truncating a name mid-word looks broken.
  4. **Hamburger added** to the list screen. `ProfilePanel`'s `reels` prop is only a
     fallback for counters it otherwise reads from `/api/account/usage`, so this screen
     passes `[]` and fetches just the reel `total` lazily when the panel opens.
- [x] **To-do hero + nav layout (2026-07-31)** — **"MY"** is now large and **accent-coloured**
  (so it tracks the active Appearance theme — it lives in the `themed()` sheet, which is
  what makes accent switching repaint it), with the rolling name inline beside it. The
  rolling half sits one notch smaller (22 vs 28): inline means it only gets the row minus
  "MY", and the longest entries would ellipsize at 28 on a narrow phone. **Home + Library**
  share one pill with a hairline between them, above the hero; the stack's global Home
  button is suppressed on this screen so there aren't two. **Settings moved bottom-right**,
  beside "New task", and spins a full turn on press — press-triggered rather than
  perpetually spinning, because constant motion beside a list you're reading is a
  distraction. ⚠️ `openLibrary` must call `markEnteredLibrary()` before navigating: `/`
  renders the landing page OR the library off that flag, so without it the Library button
  would land on the greeting.
- [x] **To-do header consistency + undo-delete (2026-07-31)**
  1. **"My"** — big accent `M`, smaller `y`, as one nested `<Text>` so the two sizes share a
     baseline automatically instead of being nudged into line by hand.
  2. **Header now reuses the Library screen's trio** (`app/index.tsx`): two hairline circles
     around one gradient circle. The centre slot holds that screen's primary destination —
     Library uses "+" for Save, this one uses the bookmark mark. ⚠️ These styles are
     duplicated, not shared: **keep `headerActions`/`menuBtn`/`saveBtn` in sync with
     `app/index.tsx`**, or the two pages drift apart again.
  3. **Undo on delete (2 s)** — bar rises from behind the New task button, accent-tinted.
     ⚠️ The `DELETE` is **deferred, not sent-and-undone**: undo cancels a timer, so the task
     keeps its id, `created_at` and `completed_on`. Re-creating would mint a new row and
     silently rewrite that history. Leaving the screen commits any pending delete
     immediately (unmount effect), and a refresh landing inside the window filters the
     pending id out so the row can't resurrect itself. Undo re-inserts optimistically, then
     re-fetches so the server stays the single authority on ordering.
- [x] **Rolling names are random, not sequential (2026-07-31)** — `RollingTagline` gained an
  opt-in `shuffle` prop (on for the to-do hero and its quotes; the landing/login taglines
  keep their existing order). Uses a **shuffle bag**, not `Math.random()` per tick: picking
  independently would repeat lines back-to-back and starve others for ages, which reads as
  broken rather than random. Each pass deals a fresh permutation, so every name shows once
  per cycle in a different order, and a new deal never opens on the line the last one closed
  with. Verified with assertions over 500 deals + simulated refills (permutation, no
  back-to-back repeats across bag boundaries, varied order, even exposure, and n=1/n=2
  don't hang).
- [ ] **To-do reminders** — a local notification the evening before / morning of a due date.
  Free in money (`expo-notifications`, no push server), but needs the **custom dev build**
  (doesn't work in Expo Go, and web needs the Notification API + a permission prompt), so it
  can't be tested in the current web loop. `due_date` is already stored; this is additive.
- [ ] **Archive as a softer alternative to delete-on-completion** — the delete prompt IS
  now built (owner reaffirmed it; see "To-do polish" above), with Keep as the primary
  action and an explicit warning naming what is lost. The concern that prompted the
  original pushback still stands though: deletion cascades and there is no trash. An
  `archived` flag on `ReelDB` would let "clear it out of my library" mean *hide*, not
  *destroy*, and would be the better default for that button. Worth doing if any user
  ever reports deleting a save they wanted back.
- [ ] **Activity grid + streak (the habit surface)** — `todos.completed_at` is already
  written and cleared on undo specifically to feed this. A GitHub-style grid where a square
  lights when the user **completed something from their library** (and optionally saved).
  ⚠️ Do **not** track "opened the app": a self-referential streak measures nothing, and when
  it breaks it removes the only reason to open. Counting *saves* alone would also pay users
  in AI spend to save junk — see the free auto-summary economics above.
- [x] **Library auto-refresh while summarizing** — the home grid polls every 4s while any card is `pending` so background summaries appear without a manual reload (pull-to-refresh also available).
- [ ] **Deep linking** — when Share Extension saves a reel, open the detail screen directly (`savehere://reel/{id}`).
- [ ] **First-run coach-marks (3 features)** — after the existing new-user pop-ups, spotlight in sequence: how to add a reel, the Library button, Ask-my-Library. Reuse the account-age <15 min gate from the onboarding tour so existing accounts never see it.
- [ ] **Ask-my-Library unlocks at 5 saves (decided 2026-07-20 — saves, not logins)** — gate Ask until the library holds ≥5 saves: an ask over a near-empty library wastes an AI action and gives a weak first answer. Login-count was rejected (mobile sessions persist for weeks — "logins" are rare, arbitrary events). Client shows a locked state with progress ("Save 3 more to unlock Ask"); server already exposes the total (`/api/reels` `total`). UX gate, not a security gate — client-side is acceptable (bypassing it only wastes the user's own quota).
- [~] **"Trip Itinerary" for travel reels (Pro-only — decided 2026-07-20)** — **backend DONE (2026-07-20):** `POST/GET /api/reels/{id}/itinerary` (`routes/workout.py`) + `extract_itinerary` (`services/workout_extractor.py`, Haiku) + `itinerary` JSON column & `itinerary_count` cap (3, like workouts) on `ReelDB`. Gate order: ownership → sensitive → `category=="travel"` (422 otherwise) → Pro gate (403) → cap (429) → content check → `charge_ai_action` → Claude. Grounding: facts (places/prices/timings) extracted-only; day GROUPING may be inferred but is flagged `structure_estimated` (the itinerary analog of workout's `is_estimated`); model reply defensively normalized (size caps, junk dropped) before storing; a failed regeneration never destroys an existing plan. Locked by `tests/test_itinerary.py` (9 cases). **Remaining = mobile:** "Trip Itinerary" button on travel detail screens rendering `days[]`/`tips[]`, with the Pro-locked upsell state for free tier.
- [x] **Pagination / infinite scroll** — `/api/reels` takes `limit`/`offset` + returns full `total`; library grid loads 24/page via FlatList `onEndReached`. Counts (header, Landing, ProfilePanel) use `total`.
- [x] **Server-side search** — `GET /api/reels/search?q=` searches title+tags+summary+notes across the full library. Library screen debounces 400ms and swaps to server results; infinite scroll disabled during search.
- [x] **Smart search (no AI cost)** — search now tokenizes the query and drops filler ("any videos on Fitness" → "fitness"), matches **category** (the old LIKE search never did — the root cause of "Fitness finds nothing but chestwork works"), expands high-precision synonyms (gym/workout ↔ fitness, recipe ↔ cooking, …), keeps prefix type-ahead, and ranks by relevance (`backend/app/services/search.py` + `tests/test_smart_search.py`). Deliberately NOT Claude-backed: search fires per keystroke and would drain the daily AI quota. Embeddings remain the semantic upgrade path.
- [x] **Tap-to-watch + link-open (web false-alert fixed)** — the detail-screen hero thumbnail (with a "Watch" chip) and the source-URL row open the original post via `mobile/services/openLink.ts`. **Root cause found + fixed (verified with a real click in-browser):** react-native-web's `Pressable` dispatches `onPress` asynchronously, so the user-activation gesture is gone by the time `window.open()` runs — it returns `null` for a genuinely-real click, and the old `if (!win) throw` fired a false "couldn't open this link" alert on every working tap (which auto-dismissed when the new tab stole focus). Web now uses an **anchor-element click** (`<a target=_blank rel=noopener>`), which opens reliably and hands back no null to misread; no cross-origin `win.opener=null` (throws in some browsers). Trade-off: web can't detect a genuinely-blocked open, but a false popup on every success was the real bug, and true failures (deleted/private post) open a tab showing the platform's own error — undetectable client-side anyway. **Native keeps the honest failure popup** (`canOpenURL` is a real signal there).
- [x] **Workout expectation modal** — before the FIRST "Build Workout", a modal sets expectations: generic template inspired by the reel, not personalized coaching; beginners scale down at their own pace; every set/rep/rest editable afterwards. Includes the fitness disclaimer chip.
- [x] **Modal ghost-click fix (web)** — the workout/category modals used a close-on-press overlay with a plain View card: on web a double-click's second click (or any click on the card body) bubbled to the overlay and closed the modal instantly. Fixed in `reel/[id].tsx`: card presses `stopPropagation`, overlay presses within 350 ms of opening are ignored; deliberate outside-clicks still close (verified live with scripted clicks).
- [x] **Onboarding tour only for NEW accounts** — the tour used to replay for an existing account on any new device/browser origin (per-device storage looked like a first login). Now gated on Supabase `user.created_at` < 15 min (i.e. right after sign-up); older accounts get the seen-flag stamped silently. Trade-off: a new user who first opens the app days after signing up skips the tour.
- [x] **Onboarding: Skip removed (2026-07-20)** — first-run tour must be seen in full; the only exit is stepping through to "Get Started". Still shown once per fresh account only (account-age gate unchanged), so it can't nag returning users.
- [x] **"beauty" category** — makeup/skincare/haircare/grooming get their own category (backend `ALLOWED_CATEGORIES`, summarizer prompt with definitions, mobile chips/modal with Brush icon, search synonyms). Adventure/trip content (trekking, biking, itineraries, destinations) is steered into **travel** via prompt hints + search synonyms instead of a new category.
- [x] **"Turn into Action" hidden for non-actionable saves** — entertainment, **motivation** and **news** (both added 2026-07-20 — motivation reliably produced generic filler like "Believe in yourself" / "Wake up early", and news is reporting with nothing for the reader to *do*; inventing steps from a headline is exactly the ungrounded output to avoid — either way an AI action spent for no value) and unknown-category (`other`/unset) reels no longer show the action section (fitness/sensitive rules unchanged). Client-side only by design: recategorizing a reel (e.g. a DIY save stuck in "other" → tech) re-enables it; already-generated task lists stay visible. Categories with their OWN specialised generator are excluded here too — fitness → Build Workout, travel → Trip Itinerary — so a card never shows two overlapping AI buttons (two charges for near-duplicate output).
- [x] **Statutory disclaimers for health & finance saves (2026-07-20)** — two new `Disclaimer` variants (`components/Disclaimer.tsx`): `health` ("general information only, not medical advice… consult a professional") and `finance` (explicit: "not financial, investment, tax or legal advice… SaveHere is not a licensed adviser… markets carry risk and you can lose money"). Shown on the summary card for `category==health`/`finance`, and repeated on the generated task list (the riskiest surface — where content becomes a checklist someone follows). Precedence: the AI-flagged **`medical`** notice (which also disables action plans, enforced server-side) always wins so two notices never stack. Note: `health` here is the NON-flagged case — genuinely high-stakes medical content is caught by `is_sensitive` and gets the stronger `medical` treatment. Mirrors the existing `fitness`/`recipe` disclaimer pattern.
- [x] **Appearance: accent themes — now LIVE switching (web + native)** — ProfilePanel → Appearance offers 5 accent palettes (Ember default, Iris, Ocean, Forest, Rose; `accentThemes` in `constants/theme.ts`). v1 applied via full page reload (multi-second on the dev server — owner flagged it as janky); v2 switches **in-place in ~130 ms**: `setAccentTheme()` mutates the tokens, re-runs every style factory registered through `themed()` (module-level `StyleSheet.create` freezes values, so the 12 accent-using sheets + 5 constant maps are wrapped in `themed(() => …)` factories behind a forwarding Proxy), then the root layout bumps a remount key. The panel reopens itself after the remount (one-shot session flag) so you can keep trying colors. This also unlocked **native**: no frozen styles left, so `_layout.tsx` applies the stored accent from AsyncStorage right after mount (one default-colored first frame). Verified live on web: no page reload (window marker survives), fully re-themed both directions, panel stays open, zero console errors. New sheets/maps that bake in accent MUST use `themed()` — plain `StyleSheet.create` will silently stay stale.
- [x] **Sensitive-content containment (medical etc.)** — the summarizer flags high-stakes health/safety advice (`is_sensitive` on reels, new prompt rule); flagged saves keep thumbnail+summary+notes but show a strong "reference only / not responsible / consult a professional" disclaimer and lose the tasks/workout actions. Enforced **server-side** (`routes/workout.py` refuses generation with a clean 422 *before* the quota charge — hiding the buttons is cosmetic). Locked by `tests/test_sensitive.py`. ⚠️ Reels summarized before this ship are unflagged until re-summarized.
- [x] **Offline banner** — non-blocking banner on the library when offline (web `online`/`offline` events) or when a refresh fails (tap to retry); Retry button on the cold "can't reach server" screen.
- [x] **Pull-to-refresh visual polish** — `RefreshControl` now uses accent colors, card background, and "Refreshing…" title (iOS + Android).
- [x] **Empty state illustrations** — already using lucide vector icons (Sparkles, CloudOff); emoji placeholders were already replaced. Search empty state shows the query string.
- [x] **Haptic feedback** — `services/haptics.ts` (web-safe wrapper; native-only, errors swallowed) wired to: save success/failure (`save.tsx`), re-summarize success/failure + delete-confirm warning (`reel/[id].tsx`), and card-delete tap (`ReelCard.tsx`). Web export verified clean.
- [x] **iPad layout** — detail screen content container capped at `maxWidth: 720` and centered.
- [x] **AI usage meter + live tier badge** — ProfilePanel shows "N of M AI actions left" with a progress bar (from `GET /api/account/usage`) and the real tier instead of a hardcoded "Free", so the daily-quota 429 is never a surprise.
- [~] **Usage drill-down: what the AI actions were spent on** — **backend DONE (2026-07-20):** `ai_action_log` table (`user_id, day, action, label`) written from inside `charge_ai_action` — the single choke point every AI endpoint already passes through, so no action can be missed; all 7 call sites labelled (summary / resummarize / tasks / recipe / workout / itinerary / ask) carrying the reel title or question text. `GET /api/account/usage/log` returns today's actions newest-first with both `used` (the meter) and `logged` (how many we can describe). Deliberately disposable: 2-day retention, pruned on write, documented as a UI convenience and NOT an audit trail; removed on account deletion (labels contain question text) while `ai_usage` counters stay (deleting those would reset the quota). Failure isolation is the contract and is structural — guarded inside `log_ai_action` AND at the call site, because past the charge the user has already paid and any exception would mean they were billed and got a 500. Locked by `tests/test_action_log.py` (9 cases). **Mobile DONE (2026-07-21):** the ProfilePanel AI-budget meter is now tappable (only when `used > 0`) and expands to today's actions — human label ("Trip itinerary", "Recipe", "Asked your library"…) + the reel title / question — via `GET /api/account/usage/log`. When `used > logged` (actions charged before the table existed, or a rare fail-open skip) it appends "+ N earlier actions today" rather than implying completeness. Lazy-fetched on first expand, reset when the panel closes. Verified: endpoint contract exercised against the real dev DB (correct labels, newest-first); typecheck + bundle clean. (Logged-in panel render is owner-verifiable — the agent's preview browser has no session.)
- [ ] **Profile: gender + matching avatar icon** — add a `gender` column (`male` / `female` / `other` / unset) to `profiles`, a picker in Edit Profile, and switch the avatar icon on it. Deliberately **not** asked at sign-up (decided 2026-07-20) — set later from the profile screen, so it never adds friction to onboarding.
- [ ] **Local notifications ("card has been created")** — `expo-notifications`. ⚠️ Scope check before starting: a local notification needs a **custom dev build** (does not work in Expo Go), and **on web it needs the browser Notification API + a permission prompt**, so it can't be fully tested in the current web loop. Value is mainly when the app is backgrounded — saves already feel instant and the library auto-polls while summarizing. Sequenced after the Postgres migration.
- [x] **Clean API error messages everywhere** — `services/api.ts` now extracts FastAPI's `detail` centrally, so no screen can ever show raw JSON to the user.
- [x] **Account deletion honesty** — if the backend data wipe fails, the app now reports the error and does NOT sign out (it used to claim success regardless).
- [x] **Visual identity — "Ember on Ink"** (branch `revamp/ui-refresh`) — full identity flip: warm ink surfaces + ember-orange accent + cream text (replacing the violet "AI look"); Fraunces serif for brand moments (login wordmark, landing greeting, reel titles); landing redesigned with a clear hierarchy — one ember Save CTA, a horizontal **recent-saves thumbnail strip** as the door to the library (replaces the misaligned stacked slabs), quiet Ask row; app icon/splash/favicon/in-app mark regenerated in ember; aurora re-tinted to candlelight; confetti/onboarding/category colors warm-harmonized.
- [x] **UI/UX revamp — "calm premium dark"** (branch `revamp/ui-refresh`) — design tokens reworked (single iris accent, hairline borders, iOS-leaning type/radius scale, soft shadows); glassmorphism/holographic chrome retired (GlassCard flattened, shimmer/particle/orbit effects removed from app screens; aurora kept on Landing/Login only); **library cards now show the real reel thumbnail** (16:10 cover with platform-tinted fallback) instead of a generic gradient pattern; flat iOS large-title header + quieter tinted category chips; save screen gained a real **"Paste copied link"** clipboard button (`expo-clipboard`), replacing the fake "Smart Paste coming soon" note. ⚠️ Owner: do a visual pass on a logged-in session (agent verified login/onboarding + zero console errors, but couldn't see the library without credentials).

---

## Mobile — App Store Requirements

- [x] **App icon** — replaced with a generated **full-bleed** 1024×1024 icon (violet gradient edge-to-edge, white bookmark + sparkle glyph, no pre-rounded corners) at `mobile/assets/icon.png`; matching `splash-icon.png` (transparent, glyph-only) and rounded `favicon.png`. Safe for Apple's mask. Source generator lives in git history (PIL script) if a tweak is needed.
- [x] **Splash screen** — `splash-icon.png` regenerated to match the new brand glyph; splash background synced to the theme background (`#0A0A0D`) in `app.json`.
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
- [x] **Truly instant save (async extraction)** — extraction itself is now OFF the request path: `/save` persists a pending card in one DB round-trip (~200 ms) and `_extract_and_summarize` fills title/thumbnail/text, charges the quota, and runs the summary in one background chain. Cache hits still fill synchronously. Failures degrade to a retryable link-only bookmark (never a vanishing card); >10-min videos become link-only bookmarks instead of late rejections; recovery re-runs the whole chain for cards orphaned before extraction. Locked by `tests/test_instant_save.py` (6 mock-based cases). ⚠️ Trade-off: bad-but-recognized links (typo'd YouTube IDs) now save a card that ends `failed` instead of 422ing — acceptable for UX, revisit if it confuses users.
- [ ] **Whisper local fallback** — for audio-only content with no captions, add local `openai-whisper` library as a free alternative to the OpenAI Whisper API.
- [x] **Apify LinkedIn integration — NOT NEEDED (removed).** Tested `pratikdani~linkedin-posts-scraper`: it runs sync for 60+ s (would block the save path) and costs ~$0.025/post. Verified the existing free `facebookexternalhit` page scrape already returns the **full** LinkedIn post body (~2.5k chars) via JSON-LD with grounded summaries — so Apify added cost + latency for zero benefit. Reverted to page-scrape-only for all platforms.
- [x] **Foreign keys enforced + no orphan children** — SQLite now runs with `PRAGMA foreign_keys=ON` (it silently ignores `ON DELETE CASCADE` otherwise), and reel/account deletion explicitly removes `tasks` + `workout_exercises` (also sweeps orphans created before the fix). Account deletion keeps `ai_usage` rows so wiping data can't reset the daily AI quota. Locked by `tests/test_data_integrity.py`.
- [x] **Workout regeneration no longer destroys the existing plan on failure** — the old plan is deleted only after a successful extraction (the tasks route already worked this way).
- [x] **`GET /api/account/usage`** — tier + used/limit/remaining/resets_at for the day, read-only (never charges). Powers the mobile usage meter.
- [x] **Alembic migrations (DONE 2026-07-21)** — Alembic is now the single schema authority (`backend/alembic/`, baseline `9aa25548aadb` matching current models). `create_tables()` runs `alembic upgrade head` on startup (idempotent); the `ALTER … except: pass` hack is deleted. `env.py` pulls the URL from `settings.DATABASE_URL` and uses `render_as_batch` on SQLite. The existing dev SQLite DB was `alembic stamp`ed to head so it isn't re-created. Verified on both SQLite and real Postgres. Future schema changes: `alembic revision --autogenerate -m "..."` then commit the migration. **Original problem (why this was a blocker, kept for context):** the old loop had no `rollback()`, so on Postgres — which aborts the whole transaction on a failed statement — the first duplicate-column error would silently kill every later ALTER, meaning new columns would never apply to the live DB while passing locally on SQLite.

---

## Pricing & Monetization (launch — App Store Connect config, needs Apple Developer account)

> All of this is **App Store Connect / RevenueCat configuration set at launch**, not app code — except the AI-cap pieces, which need the per-user quota (auth project). Apple owns IAP billing, so discounts must use Apple's native offers, not a custom coupon.

- [ ] **Regional (PPP) pricing** — three storefront buckets, not 175 hand-tuned prices:
  - **US / high-income:** ~$4.99/mo, ~$34.99/yr (margin lever)
  - **EU:** ~€5.99/mo, ~€39.99/yr (price up vs US — displayed price is VAT-inclusive, ~20%)
  - **India + PPP-low countries:** **₹99/mo**, **₹799–₹999/yr** (volume lever)
- [ ] **India first-purchase promo** — Apple **Introductory Offer** (pay-as-you-go): **₹59/mo for the first 3 months, then ₹99/mo**, India storefront only, auto-renewing. Apple's required pre-renewal notice = the "ask to renew," handled automatically. Optionally also mint a custom **Offer Code `SAVEHEREFIRST`** for marketing/launch buzz (same ₹59×3 deal). ⚠️ Don't make it 3 months *free* (token cost + abuse) and don't use a non-renewing product (worse retention).
- [ ] **Price ↔ AI-cap pairing rule** — `[Certain]` net revenue per user must stay ≥ their token cost. ₹99 is the lowest price safe at the current 30/day AI cap (even at Apple's 30%). To go lower (₹49–₹79) the India tier needs a **tighter AI cap** (~7–10/day). The per-user quota is now **tier-aware** (`daily_limit_for(user)` reads `app_metadata.tier`; limits via `AI_DAILY_LIMIT`/`AI_PRO_DAILY_LIMIT`) — so a cheaper, tighter-capped tier just needs (a) a new limit constant and (b) the IAP/RevenueCat webhook stamping the tier on the user. Until tiers are sold the free limit is global, so ₹99 is the floor.
- [~] **Tiers — mechanics BUILT (branch `feat/tier-system`), billing pending** — server-side entitlements (`app/entitlements.py`, the single source of truth): **trial** (TRIAL_DAYS=10 from first authenticated request, 30 AI/day, unlimited saves) → **free** (trickle: 3 AI/day + 20-save cap on NEW saves; library/view/search never lock; deleting below the cap re-opens saving) → **pro** (100 AI/day, unlimited; `app_metadata.tier` stamped via `backend/scripts/set_tier.py` — deliberately a script, not an endpoint). **Loophole containment:** trial clock lives in a `profiles` row (client can't forge it) and is keyed to a SHA-256 of the normalized email (`trial_grants`, survives account deletion; gmail dots/+tags collapsed) so re-signup CONTINUES the original trial instead of resetting it. Accepted residues: brand-new emails still mint trials (fixed economically by Apple IAP at launch); JWT downgrade staleness ≤1 h (~$0.15 worst case); save cap is soft under concurrent saves. Referrals deferred (fraud surface > value pre-launch) — `trial_extra_days` is the ready seam; onboarding copy no longer promises them. 18 tests in `tests/test_entitlements.py`. **Remaining at launch:** RevenueCat webhook (signature-verified, idempotent) replaces the script; finalize pro pricing/limits.
- [~] **Feature gating: free = workout + recipe; ask/tasks/itinerary = Pro (decided 2026-07-20)** — **server side DONE (2026-07-20):** `Entitlements` carries `can_ask`/`can_tasks`/`can_itinerary` (trial + pro = all True; post-trial free = all False); `/api/ask` + `/api/ask/stream` and non-cooking `POST /reels/{id}/tasks` return 403 with `PRO_FEATURE_DETAIL` (cooking tasks = the recipe feature = stays free, workout stays free); gates fire BEFORE the quota charge so a refused call never costs an AI action; `GET /api/account/usage` exposes a `features` dict for the app's locked-button UI. Locked by `tests/test_feature_gating.py` (11 cases: tier × feature matrix, no-charge-on-403, usage flags). **Remaining = mobile:** locked-button-with-Pro-badge states driven by `usage.features` (cosmetic — server already enforces). Locked buttons must NOT link to web payment (anti-steering, India). **Trial keeps FULL access** — locks appear only after expiry. **Decision (same date): auto-summary stays ON for every tier** — cheapest AI action (~$0.005, Haiku) and the product's conversion moment; click-to-generate for post-trial free is a data-driven revisit only if summary spend dominates after launch (plumbing exists: `failed`→retry already IS click-to-generate). Known interaction: free users' 3/day quota is shared with auto-summaries.
- [ ] **RevenueCat** — manage IAP entitlements + per-territory pricing + promo experiments across iOS/Android. Webhook endpoint is sketched + tested (`app/routes/billing.py`, `tests/test_billing.py`, 15 cases) but **not registered in `main.py`** — activation needs `REVENUECAT_WEBHOOK_TOKEN` set, the 2-line router include, and the mobile app calling `Purchases.logIn(supabaseUserId)` (without which every webhook lands in the ignored-anonymous branch).
- [ ] **Apple Small Business Program** — enroll (<$1M/yr) → 15% commission instead of 30%. Materially improves every margin above.

---

## Nice to Have (post-launch)

- [ ] **Android version** — Expo build for Google Play. Share Intent equivalent for Android.
- [ ] **Biometric app-lock (Face ID / Touch ID) — opt-in, post-launch (decided 2026-07-20)** — a Settings toggle "Require Face ID to open SaveHere": `expo-local-authentication` gate over the persisted Supabase session in `_layout.tsx`. **Explicitly NOT a pre-launch item:** Sign in with Apple already delivers Face-ID *authentication* (the OS uses biometrics at the Apple sign-in step — zero code from us). This feature adds only the *reopen-the-app privacy gate*, which Apple login does NOT provide (sessions persist for weeks → app reopens with no prompt). For links+notes data that gate is low-value polish, not protection. Needs a real device + custom dev build (no Face ID on web/simulator), so it also can't be tested in the current web loop. Revisit only if the "unlocked phone → open library" scenario matters after launch.
- [ ] **Collections / folders** — group saved items beyond category tags.
- [ ] **Export** — download all saved summaries as PDF or Markdown.
- [ ] **Analytics** — PostHog or Mixpanel (free tier) to understand which features are used.
- [ ] **GDPR / data deletion** — "Delete my account and all data" flow, required for EU users.
- [~] **Supabase Row Level Security** — `backend/scripts/enable_rls.sql` is ready (deny-all: enables + FORCEs RLS on every app table, no client policies, since the mobile app only uses Supabase for auth and all data flows through the FastAPI service-role connection). ⚠️ Owner action: run it against the Supabase project once the Postgres migration above lands, and verify with the anon-key curl check in the script's comments.
- [~] **CI/CD pipeline** — GitHub Actions: backend pytest runs on push/PR (`.github/workflows/ci.yml`); **mobile `npm run typecheck` now runs on push/PR touching `mobile/`** (`.github/workflows/mobile-ci.yml`, `npm ci` + `tsc --noEmit`) — closes the gap where the `launch-prep/ui-revamp` branch shipped an `app/index.tsx` that didn't even parse. Each workflow is path-scoped so a mobile-only change doesn't run the Python suite and vice versa. TODO: EAS build on merge to main.
- [x] **Three standing test accounts (trial / free / pro)** — **DONE (2026-07-21):** owner created the accounts, `scripts/dev_seed_tiers.py` stamps all three in one command (`python scripts/dev_seed_tiers.py`). It resolves email→Supabase id, writes the pro JWT claim for `protieruser@gmail.com`, and pre-seeds the local `profiles` clock for `freetieruser` (expired→free) and `trailtieruser` (fresh→trial; note the "trail" spelling as created), clearing each day's AI counter so a flipped tier isn't instantly over cap. Verified all three resolve to the intended tier (30/3/100 AI). SQLite-guarded; needs `SUPABASE_*` in `.env`. Deliberately **not** an in-app switcher: `scripts/set_tier.py`'s own docstring rejects that ("a forgotten temporary admin endpoint is a standing self-upgrade hole"). ⚠️ pro needs a sign-out/in (JWT caches tier ≤1h); trial/free apply on the next request. Also available: `scripts/dev_tier.py status|expire|trial|resetquota` for one-offs.
- [~] **Unit tests** — `backend/tests/` (pytest, **190 tests across 19 files** as of 2026-07-20; newest: `test_feature_gating.py`, `test_itinerary.py`, `test_billing.py`, `test_action_log.py`): `normalize_url`, `detect_platform`, `_parse_vtt`, `_og` (+ backtracking-hang regression guard), `_extract_jsonld`, `_weak_title`, `_to_response` coercion, the per-IP rate limiter, the per-user daily AI quota (atomic charge, zero-limit kill-switch, tier resolution from `app_metadata`, + wired-into-`/api/ask` integration, no real Claude call), task source disclaimers, DB-backed list/pagination/search + per-user-isolation endpoint tests (in-memory SQLite + TestClient), JWT auth verification, and mock-based `extract_tasks` cooking-fallback tests, smart-search ranking (`test_smart_search.py`), and sensitive-content containment (`test_sensitive.py`). Fixed a daily flake: `test_quota.py` asserted on local `date.today()` while the quota keys rows on the UTC day — failed every run between 00:00 and 05:30 IST; now uses `_utc_today()`. Run with `python -m pytest tests/ -q` from `backend/`. **CI:** `.github/workflows/ci.yml` runs the suite on every push/PR touching `backend/`. TODO: mock-based test for `summarizer.summarize`.

---

## Done

- [x] FastAPI backend with SQLAlchemy + SQLite
- [x] yt-dlp content extraction (YouTube, Instagram, TikTok)
- [x] YouTube auto-caption extraction (VTT, all languages)
- [x] Claude Haiku summarization with quality prompt
- [x] Multi-language caption and summary support
- [x] Re-summarize (refuses empty result; per-reel 3-try cap removed 2026-07-14 — the per-user daily AI quota is the cost ceiling, UI shows a quota notice)
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

---

## Design Experiment: Refactor Home & Nav to Nocturnal Dimension

> ⚠️ **Temporary section — experiment, not a commitment.** Delete this section
> and `docs/DESIGN_PROPOSAL.md` together if the direction is rejected.
> Started 2026-08-09. Owner suspended the UI rules in `docs/HANDOFF.md` §4.5
> for this experiment.

Full spec: [`docs/DESIGN_PROPOSAL.md`](docs/DESIGN_PROPOSAL.md). No application
code has been modified yet.

- [x] **Refero research + token extraction** — Suno, Vapi, Dimension, Hyper Foundation. Real token sets, nothing invented.
- [x] **Draft the visual spec** — colours, type, spacing/radius, home hierarchy, capsule nav parameters.
- [x] **DECIDED: `danger` becomes a real red** (owner, 2026-08-09). `#E05561` dark / `#B3323E` light. ⚠️ **Derived, not sourced** — neither Suno nor Vapi ships a red; it is Suno Vivid Pink `#FD429C` rotated 337°→355°, desaturated 98%→69%. `success`/`warning` stay monochrome.
- [x] **DECIDED: `docs/HANDOFF.md` §4.5 marked ⛔ RETIRED**, with the rules that still hold (tokens-only, content-first, Icon.tsx map, subtle motion, ReelCard comparator) listed explicitly so they don't get lost with the dead brief.
- [x] ~~**Re-introduce Fraunces**~~ — **DROPPED** (owner, 2026-08-09): avoids font-loading latency on SDK 56. Headers and titles use `Inter_600SemiBold`; `typeface.serif` is unchanged.
- [x] ~~**Generate the grain asset**~~ — **DROPPED** (owner, 2026-08-09): the haze gradient carries it alone.
- [x] **Applied palette + radius changes** in `mobile/constants/theme.ts` — key names unchanged, so every screen compiles untouched. `radius.xl` 20→24, new `gradients.haze` + `hazeLocations`. `npm run typecheck` and `npx expo export --platform web` both pass.
- [x] **Audited all 24 `<LinearGradient>` call sites** (sub-agent, isolated context). 16 flat `gradients.*`, 1 `scrim`, 5 theme-derived arrays, 2 hardcoded.
- [x] **DECIDED: Option B — primary actions keep the cream inversion** (owner, 2026-08-09). `colors.accent` orange is reserved for active tabs, filter chips, and the centre FAB. Rationale: 15 orange buttons is how one accent becomes wallpaper.
- [x] **Collapsed the retired rainbow tokens** — `gradients.vibrant`/`sunset`/`cool` deleted (three names for identical flat ink; sunset=itinerary, cool=recipe, vibrant=workout — meaning colour no longer carries). 8 call sites retargeted to `gradients.primary`.
- [x] **Deleted 4 dead gradients** — `surface`, `hologram`, `neon`, `darkSurface`. Zero call sites, verified by grep before removal.
- [x] **Fixed both hardcoded ramps** — `reel/[id].tsx:366` `['transparent','rgba(0,0,0,0.88)']` → `gradients.scrim`; `workout/session/[reelId].tsx:214` `['#15131C','#1A2740','#15131C']` → `gradients.haze` (was dark-only and would not follow `setScheme`).
- [x] **Fixed the `platformMeta` drift** — was hardcoding `#F8F8F8`/`#0B0B0B`; now reads `PALETTES.dark.textPrimary`/`.card` so it can't silently desync from the palette again. This was a regression introduced by the palette swap, not pre-existing.
- [x] **Landed all 3 `gradients.haze` adoptions** — workout rest backdrop, LoginScreen (layered above the wash, below the bottom ramp so legibility is untouched), and the library-grid screen root (`app/index.tsx`, `pointerEvents="none"`).
- [x] **Verified in the browser** — `npm run typecheck` clean; dark scheme renders on `#101012`; haze confirmed painting at 989×963 with all 4 stops at the right locations; every `ReelCard` scrim now resolves through the token.
- [ ] ⚠️ **The haze is effectively invisible on the library grid.** It renders correctly but sits *behind* a full-bleed thumbnail mosaic, so almost none of it is ever on screen. It reads only on the workout rest screen and the login wall, which are mostly empty. Either accept it as atmosphere for sparse screens only, raise the stop opacities (currently 10%/14%), or move it above the grid at very low alpha. Owner's call — do not "fix" by adding blur.
- [ ] **`Landing.tsx` has no haze.** `app/index.tsx:214` early-returns `<Landing/>` before the patched root, so the editorial hero screen is untouched. `DESIGN_PROPOSAL.md` §4 specs the library grid, not the hero — decide whether the hero should get it too.
- [ ] **Capsule tab bar + centre FAB still unbuilt** — `components/TabBar.tsx` currently renders a pill bar off `colors.tabBarTop`/`tabBarBottom`. The FAB, active-tab orange dot, and filter-chip accent are where Option B says the orange actually earns its place.
- [ ] **Build the capsule tab bar + centre FAB** in `app/(tabs)/_layout.tsx`.
- [ ] **Home screen**: haze gradient root, Fraunces greeting, filter pill row.
- [ ] **Verify on web + Android** — the whole point of this hybrid is no `expo-blur`. Confirm the gradient costs nothing on scroll before calling it done.
- [ ] **Contrast audit** — `#F7F4EF` on `#101012` and `#101012` on `#E96B34` both need re-measuring; the current palette's ratios are documented in `theme.ts` comments and must not regress.

## Active Refactoring & Optimization Backlog
> **Audited 2026-08-09 against the working tree** (sub-agent, evidence-checked —
> not trusted from checkbox state). Most of this section was written twice: the
> to-do latency, haze, and setScheme items each appeared as two entries. Shipped
> in PR #39 (`da00e8a`).

- [x] **Optimize To-Do List Interaction Latency** — `TodoRow` is `memo(...)` (`todos.tsx:104`), row handlers `useCallback` (`todos.tsx:257,336,350,433,434`), `grouped`/`overdueCount` `useMemo` (`todos.tsx:440,451`). *(Duplicate of "Optimize To-Do List Click Latency" below.)*
- [x] **Light Scheme Haze Sanity Check** — `hazeFor(p, s)` returns four copies of `p.background` in light and the chromatic ramp in dark (`theme.ts:186-190`), called from both the `gradients` literal (`theme.ts:226`) and `applyScheme` (`theme.ts:306`). Verified at runtime: light computes `linear-gradient(rgb(255,255,255) ×4)`. *(Duplicate of "Light Mode Visual Sanity Check" below.)*
- [x] **Fix setScheme Runtime Key Mapping** — `Record` cast gone; each key assigned by name (`theme.ts:298-305`); `gradients.haze = hazeFor(p, s)` (`theme.ts:306`); the legacy keys survive only in the removal comments. *(Duplicate of "Clean Up Legacy Group 1 Tokens" below.)*
- [x] **Resolve Task Checkbox Tap Latency (`TaskList.tsx`)** — `onUpdate({ ...task, completed: next })` fires before `await api.toggleTask`, with rollback on catch (`TaskList.tsx:154-163`); `toggling` spinner state deleted.
- [~] **Optimize ScrollView Render Latency (`todos.tsx`)** — Steps 1 and 2 done. **Step 3 solved differently on purpose:** `{editorOpen && <TodoEditor/>}` would unmount the sheet on close and eat its `<Modal animationType="fade">` exit animation, so `TodoEditor`/`TodoSettingsSheet` are memoized and kept mounted with stable callback props instead (`TodoEditor.tsx:353`, `TodoSettingsSheet.tsx:178`). Same win, no UX regression. Still open: no virtualization (`ScrollView` + nested `.map`) — deliberately deferred until the memo work is measured, since at 10–40 rows it may buy nothing.
- [x] **Fix Floating Navigation Layout Collisions** — `/workout/` in `HIDE_ON` (`TabBar.tsx:33`); footer uses `useSafeAreaInsets` (`workout/[reelId].tsx:39,152`). ⚠️ Task 1's "Itinerary" and "Study Plan" screens **do not exist**: itinerary is a section inside `reel/[id].tsx` (whose container already clears the bar), and "Study Plan" has no code at all — the only match in `mobile/` is marketing copy in `OnboardingModal.tsx:63`. Nothing else to clear.
- [x] **Fix Workout Plan Bottom Clearance** — `HIDE_ON = ['/save', '/pro', '/workout/']` (`TabBar.tsx:33,79`); hardcoded `110` replaced by `FOOTER_HEIGHT` (`workout/[reelId].tsx:28,166`).
- [x] **Clean Up Legacy Group 1 Tokens** — duplicate of "Fix setScheme Runtime Key Mapping"; same evidence.
- [x] **Optimize To-Do List Click Latency** — duplicate of "Optimize To-Do List Interaction Latency"; same evidence.
- [x] **Light Mode Visual Sanity Check** — duplicate of "Light Scheme Haze Sanity Check"; same evidence.
- [x] **Remove stale dead theme keys (`refactor/stale-theme-cleanup`, 2026-08-09)** — deleted the seven retired compat aliases from `colors` (`hologram`, `neonPink`, `neonCyan`, `neonViolet`, `glassBg`, `glassBorder`, `glassBorderLight`) and their `applyScheme` re-point lines. Grep confirmed **zero readers outside `theme.ts`** — they were kept alive only by their own re-theme statements.
- [x] **Name the last stale hardcoded number** — `todos.tsx` scroll padding `+ 92` is now `BOTTOM_BAR_CLEARANCE`, beside the existing `UNDO_ABOVE_BAR = 74`.
- [n/a] **"Stale HMR cache assumptions"** — no code artifact exists. Grep for `HMR`/`hot reload`/`fast refresh` across the repo returns only `package-lock.json` integrity-hash false positives. This referred to a stale *browser console buffer* observed during development, not to anything in the codebase.
- [x] **Fix Workout Plan Rest-Time Contrast (Bug 1)** — root cause was NOT the plan screen (`workout/[reelId].tsx` rest tag was already on `textTertiary`/`textSecondary` and fine). It was `workout/session/[reelId].tsx` `restCount`, the 110px countdown, styled `colors.onAction` — which **is** the page background in both schemes, so it rendered near-black on the dark canvas and white-on-white in light. Now `colors.textPrimary`.
- [x] **Fix Navigation Tab Active Indicator Collision (Bug 2)** — ⚠️ **the prescribed fix was for a bug that didn't exist.** `TabBar` already exact-matched the root (`pathname === '/' || pathname === '/index'`); there was no `startsWith('/')` collision. The real cause: Home and Library **share** the route `/` and are distinguished by a session flag, so `usePathname()` never changes between them — and `TabBar` emitted `libraryState` for the route to consume but **never subscribed to it itself**, so nothing re-rendered the bar. Fixed by subscribing (`useEffect(() => onUi('libraryState', bumpActive), [])`). The `/`-exact guard was also applied to `HIDE_ON` defensively, but it is a no-op today — `HIDE_ON` contains no `/` entry.
- [x] **Remove Library Header Search Option (Feature Change 3)** — `<TextInput>` search row deleted from `app/index.tsx`, replaced by memoized `RollingTagline` over `LIBRARY_CAPABILITIES` (module-level so the memo holds). Style keeps the old 42px footprint so the grid doesn't shift. Orphaned `Search`/`XCircle`/`TextInput` imports removed.
- [ ] **Follow-up to Feature 3 — strip the dead search plumbing.** `app/index.tsx` still carries `search`/`searchResults`/`searching` state, the debounce effect, `searchEverywhere()`, and the `inSearchMode` empty states ("No matches", "Search all categories") — all now unreachable, ~50 lines. Left in place deliberately so the decision stays easy to reverse. **Also note: this removed the only entry point to the server-side smart search** (`app/services/search.py` — tokenizing, synonyms, category matching, relevance ranking). That backend feature is now unreachable from the app.
- [x] **Implement Ask Screen Focus Hand-Off (Feature Change 4)** — Home card now renders an animated, high-emphasis `ASK YOUR LIBRARY` (MotiView fade/rise, no loop) instead of the static save count; `ask.tsx` focuses its input via a ref on a 350 ms timer rather than `autoFocus`, because focusing mid-push-transition is the case where iOS shows a caret but never raises the keyboard.
- [ ] **make sure the mockreel tiles been shown in both light and dark modes** - Make the mockreel run on login page for dark and light modes.



