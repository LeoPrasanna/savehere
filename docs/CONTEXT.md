# SaveHere — Context & Decisions (handoff)

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
    database.py          ReelDB, TaskDB, WorkoutExerciseDB, ExtractionCacheDB (+ ALTER-TABLE migrations)
    ratelimit.py         per-IP sliding-window limiter (burst + daily)
    routes/
      reels.py           save/list/get/delete, notes, category, resummarize; extraction cache + eviction
      workout.py         tasks (AI once) + manual add/edit/delete; workout plans
      ask.py             "ask your library" endpoint (burst + daily caps)
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

- Save pipeline (yt-dlp + caption/description fallback + extraction cache), Haiku summaries + tags + category.
- Per-reel **AI caps**: tasks generated **once** then manual add/edit/delete; workout ×3; resummarize ×3.
- **Ask your library** — retrieval-based (only top-15 relevant saves sent to Claude).
- Search (title+tags+summary+notes), Rediscover, Help/"what you can do", landing page, profile/hamburger.
- Editable category, auto-saved notes, link-only bookmarks for login-walled platforms (FB/LinkedIn).
- Per-IP rate limiting incl. daily cap on `/api/ask`; audio download size guard; cache eviction; `/health/extract` self-test.
- 27 pytest tests; `npm run typecheck` and `npx expo export --platform web` both pass.

**Not built yet:** auth, per-user data (everything shares one DB), deployment, payments, iOS share extension.

## 4. Key decisions (the "why")

### AI cost & caps
- Model: Claude Haiku `claude-haiku-4-5-20251001`. Pricing **$1/1M input, $5/1M output** `[Certain]`.
- Est. per-ask cost ~**$0.0015** after retrieval (was ~$0.0055 when dumping 60 reels) `[Guessing on tokens]`.
- `/api/ask` was the only **uncapped** AI feature → added per-IP **daily cap 15/day** (`ASK_DAILY_LIMIT`) on top of 15/min burst. This is an **interim guardrail**: in-memory (resets on restart), per-IP (shared NAT). The real fix is a **per-user daily/monthly quota**, which needs auth and doubles as the paywall lever (free vs paid limits).
- Rule to never cross: **net revenue per user ≥ their token cost.** Price-down and cap-down are ONE lever.

### Pricing (planned — see TODO "Pricing & Monetization")
- Regional / PPP, three buckets: **US** ~$4.99/mo, $34.99/yr · **EU** ~€5.99/€39.99 (VAT-inclusive) · **India** ₹99/mo, ₹799–999/yr.
- **India first-purchase promo:** Apple **Introductory Offer** ₹59/mo × 3 months → ₹99 (auto-renew; Apple's pre-renewal notice = the renewal ask). Optional marketing **offer code `SAVEHEREFIRST`**. NOT a custom coupon (Apple owns IAP billing) and NOT 3 months free.
- iOS subscriptions **must** use Apple IAP (15% via Small Business Program / 30% otherwise) — can't use Stripe in-app. Manage with RevenueCat.
- "Lifetime" tier: deferred for v1 (unbounded AI-cost liability without a hard cap).

### Auth (planned — parked)
- Recommended **Supabase** (auth + Postgres in one; $0 free tier through early launch, ~$25/mo Pro for always-on at launch). Clerk is the runner-up (better auth DX, but auth-only → second vendor).
- Plan: `users` table, `user_id` FK on reels/tasks/workouts, JWT-verify dependency, per-user query filtering + ownership checks, per-user AI quota (replaces interim per-IP cap). Keep SQLite for local dev, Postgres for prod.

## 5. Known gotchas / constraints
- **Windows dev**; line endings show LF→CRLF warnings (harmless).
- Rate limiter is **in-memory + per-process** — fine for one instance; needs Redis for multiple.
- DB is **SQLite** (single file) — not for multi-user prod; migrate to Postgres with auth.
- Mobile dev is on **web**; native device testing needs EAS/Mac (deferred).
- In a Codespace, the browser's `localhost:8000` does NOT reach the container backend — set `EXPO_PUBLIC_API_URL` to the forwarded backend URL (see `docs/REMOTE_DEV.md`).
- Audio transcription needs **ffmpeg** installed (optional path).

## 6. Next steps (recommended order)
1. **Set the Anthropic console monthly budget cap** (owner action — the only hard cost ceiling today).
2. **Auth + per-user data** (Supabase): users table, `user_id` everywhere, per-user filtering, per-user AI quota. *Largest pure-code unlock; enables tiers/referrals/quota.*
3. **Deploy backend** (Railway/Render) + point `EXPO_PUBLIC_API_URL` at it + lock CORS + Postgres.
4. **iOS share extension** (needs Mac/EAS) — the core capture gesture.
5. Pricing/IAP config in App Store Connect (intro offer, offer code, regional prices) — at launch.

See [`TODO.md`](../TODO.md) for the full, categorized checklist.
