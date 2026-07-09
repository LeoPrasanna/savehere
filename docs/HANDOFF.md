# HANDOFF — continue the SaveHere revamp

> **Audience:** any AI coding agent (including smaller/cheaper models) picking up
> this work in a fresh session. Read this file top to bottom before writing code.
> It tells you what was just done, the rules you must not break, and gives you
> ready-to-use prompts for the next tasks in priority order.

---

## 0. Required reading, in this order

1. `CLAUDE.md` (repo root) — working style + quality bar + conventions.
2. `docs/CONTEXT.md` — architecture and the *why* behind decisions.
3. `TODO.md` — the release checklist. Never silently drop an item.
4. This file.

## 1. State as of branch `revamp/reliability-tiers` (2026-07-09)

Branched off `launch-prep/ui-revamp` (which is ahead of `develop`). This branch fixed:

| Area | What changed | Where |
|---|---|---|
| Data consistency | SQLite `PRAGMA foreign_keys=ON`; reel/account deletes explicitly remove `tasks` + `workout_exercises`; `ai_usage` kept on account delete (quota-reset abuse) | `backend/app/database.py`, `routes/reels.py`, `routes/account.py` |
| Cost ceiling | Save-time auto-summary now charges the per-user daily AI quota (was the last uncapped Claude path); over budget → card saves, summary marked `failed` | `routes/reels.py` `save_reel` |
| Wasted charges | `summarize_now` refuses (422, free) when a reel was already `skipped` with nothing readable; `generate_workout` does free checks before charging and only deletes the old plan after a successful extraction | `routes/reels.py`, `routes/workout.py` |
| Security | Thumbnail proxy: domain-suffix host match (substring check allowed `ytimg.com.evil.example`), https-only, rate-limited | `backend/app/main.py` |
| Tier surface | `GET /api/account/usage` → `{tier, used, limit, remaining, resets_at}`; read-only | `routes/account.py`, `app/quota.py` `usage_today` |
| Mobile | AI usage meter + live tier badge in ProfilePanel; central `detail` error parsing in `services/api.ts`; account-delete no longer claims success when the wipe failed | `mobile/components/ProfilePanel.tsx`, `mobile/services/api.ts`, `mobile/contexts/AuthContext.tsx` |
| Broken commits repaired | `app/index.tsx` had its component header deleted (didn't parse); RN type errors (`absoluteFillObject`, `transitionProperty`, gradient tuples, `onLayout` on custom Pressable) | `mobile/app/index.tsx`, `components/*` |
| Tests | `backend/tests/test_data_integrity.py` (9 tests) locks cascade deletes, account deletion, usage endpoint, thumbnail host guard | 92 backend tests total |

## 2. Rules you must not break (the guardrails)

1. **Never add an AI endpoint without `charge_ai_action(db, user)`** — after free
   validation checks, before the Claude call. This is the cost ceiling. If you
   see an AI call that doesn't charge, that's a bug — fix it or flag it.
2. **A failed operation must never destroy existing user data.** Delete/replace
   only *after* the new result exists (see `generate_tasks` / `generate_workout`).
3. **Charge order:** free checks → `charge_ai_action` → Claude call. Charging for
   a guaranteed failure wastes the user's budget; not charging leaks money.
4. **Errors reach users as clear sentences,** never raw JSON or stack traces.
   Backend: `HTTPException(detail="human sentence")`. Mobile: `api.ts` already
   extracts `detail` — don't bypass `request()`.
5. **Secrets live in `.env` only.** Never commit or print one.
6. **Commit only when asked.** Branch off `develop`. Commit trailer:
   `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
7. **Expo SDK 56 changed a lot** — check https://docs.expo.dev/versions/v56.0.0/
   before writing Expo code. `StyleSheet.absoluteFillObject` no longer exists in
   the types (use explicit `position:'absolute', top/left/right/bottom: 0`);
   `LinearGradient` colors need a tuple (`as [string, string]`); no web-only CSS
   props (`transitionProperty`) in stylesheets.
8. **Update `TODO.md`** when you finish or discover work. It is the release gate.

## 3. Verification — run ALL of these before saying "done"

```bash
# backend (from backend/)
python -m pytest tests/ -q            # must stay green (92+)

# mobile (from mobile/)
npm run typecheck                     # uses --stack-size=16000; plain tsc crashes — that's expected
npx expo export --platform web        # must complete; bundle lands in dist/_expo
```

If you touched save/extract/summarize logic, also boot the API in-process and
probe it (no network needed):

```bash
cd backend && python -c "
from fastapi.testclient import TestClient
from app.main import app
c = TestClient(app)
assert c.get('/health').json()['status'] == 'ok'
assert c.get('/api/account/usage').status_code == 401   # auth still enforced
"
```

## 4. Next tasks, in priority order — copy-paste prompts

Each prompt is self-contained. Do them one at a time, verify (§3), update TODO.md.

### 4.1 Delete the Supabase Auth user on account deletion (App Store blocker)

> In the SaveHere repo, read CLAUDE.md, docs/CONTEXT.md and docs/HANDOFF.md first.
> Task: `DELETE /api/account` in `backend/app/routes/account.py` wipes user data
> but leaves the Supabase Auth user record — Apple guideline 5.1.1(v) requires
> full account deletion. After the data wipe succeeds, call Supabase's Admin API
> to delete the auth user: POST to `{SUPABASE_URL}/auth/v1/admin/users/{user_id}`
> is the REST form, or use the `supabase` Python client's
> `auth.admin.delete_user(user_id)` with `settings.SUPABASE_SERVICE_ROLE_KEY`
> (already in `app/config.py`). Requirements: (1) if the auth deletion fails,
> return 502 with a clear human message and DO NOT claim success — the data is
> already gone, so say exactly that ("your data was erased but the account
> record could not be removed — contact support"); (2) never log or echo the
> service-role key; (3) add a test that mocks the admin call (no network in CI)
> covering success and failure; (4) keep `mobile/contexts/AuthContext.tsx` in
> sync — after full deletion, `signOut()` locally. Update TODO.md when done.

### 4.2 Add mobile typecheck to CI

> In the SaveHere repo, read docs/HANDOFF.md §2 first. Task: extend
> `.github/workflows/ci.yml` with a job that runs on changes under `mobile/`:
> `npm ci` then `npm run typecheck` (Node 20, working-directory `mobile`).
> Rationale: a recent branch shipped an `app/index.tsx` that didn't parse.
> Keep the existing backend job untouched. Verify the YAML is valid.

### 4.3 Show remaining AI budget after each AI action (mobile polish)

> In the SaveHere repo, read docs/HANDOFF.md first. Task: after any successful
> AI action (save with summary, ask, get-recipe, build-workout, re-summarize),
> refresh the usage meter data. `api.getUsage()` exists (`GET /api/account/usage`).
> Add a lightweight shared hook `hooks/useUsage.ts` that caches the last Usage
> and exposes `refresh()`; call it from `app/ask.tsx`, `app/save.tsx`,
> `app/reel/[id].tsx`, `app/workout/[reelId].tsx` after successful AI calls, and
> show a subtle "N AI actions left today" line where a screen already shows a
> success state. When `remaining` hits 0, show it as informative copy, not an
> error. Must pass `npm run typecheck` and `npx expo export --platform web`.

### 4.4 Trusted-proxy handling for the rate limiter (pre-deploy)

> In the SaveHere repo, read docs/HANDOFF.md §2. Task: `backend/app/ratelimit.py`
> `_client_ip()` trusts `X-Forwarded-For` unconditionally — spoofable when the
> API is reached directly. Add a `TRUSTED_PROXY` env setting (default off): when
> off, use `request.client.host` only; when on (Render/Railway), use the
> left-most XFF entry. Add tests for both modes. Update TODO.md.

### 4.5 Per-platform save success-rate metric (observability)

> In the SaveHere repo, read docs/CONTEXT.md §4 ("Extraction & bot-detection")
> and docs/HANDOFF.md. Task: add a tiny in-process counter module
> `backend/app/metrics.py` tracking save attempts/successes per platform
> (thread-safe dict, no external deps), incremented in `save_reel`, exposed on
> `GET /health/extract` as `{"save_rates": {platform: {ok, fail}}}`. This is the
> early-warning signal that yt-dlp broke for a platform. Reset on restart is
> fine — document that. Add a test.

### 4.6 Tighter-capped India tier (only when pricing is finalized)

> In the SaveHere repo, read TODO.md "Pricing & Monetization" and app/quota.py.
> Task: the quota is tier-aware via JWT `app_metadata.tier` ("free"/"pro").
> Add a third tier "lite" (env `AI_LITE_DAILY_LIMIT`, default 10) for the
> low-price India storefront: extend `tier_for` to accept it, `daily_limit_for`
> to map it, and the `Usage` type in `mobile/services/api.ts`. Do NOT invent
> billing — the RevenueCat webhook stamps the tier at launch. Add quota tests.

## 4.5 UI system (branch `revamp/ui-refresh`) — rules for any UI work

The app moved to a **"calm premium dark"** design system. If you touch UI:

- **Tokens only** — every color/space/radius/type value comes from
  `mobile/constants/theme.ts`. Never hardcode hex values in screens.
- **One accent** (iris violet `colors.accent`) for actions/active states. Color
  otherwise carries *meaning* (platform, category, status) — never decoration.
- **No glassmorphism / neon / rainbow gradients.** `gradients.hologram` and
  `gradients.neon` are legacy aliases that now resolve to the brand violet ramp
  — don't reintroduce multi-hue gradients. `GlassCard` is a flat card.
- **AuroraBackground appears ONLY on Landing and LoginScreen.** App screens are
  flat `colors.background`.
- **Motion is subtle**: 250–350 ms fades/rises on entrance, spring scale on
  press (via `components/Pressable`). No loops, pulses, shimmer sweeps or
  orbiting elements.
- **Content first**: ReelCard shows the real `thumbnail_url` (via `thumbUrl()`
  proxy helper) with a platform-tinted fallback. Don't cover content in chrome.
- Verify with `npm run typecheck` + `npx expo export --platform web` after any
  UI change; boot `npx expo start --web` and check the browser console is clean.

## 5. Known open risks (don't "fix" casually — read context first)

- **Extraction from datacenter IPs fails for YouTube/IG** — the prod-critical
  risk; the fix is architectural (residential proxy / client-side metadata).
  See `docs/CONTEXT.md` §4. Don't burn time patching yt-dlp flags.
- **In-memory rate limiter** is per-process — Redis only when multi-instance.
- **`recover_pending_summaries`** runs uncharged (bounded at 25) — accepted.
- **Thumbnail proxy follows redirects** off a whitelisted CDN — accepted, noted
  in TODO.
- The **Landing/Onboarding screens** were being reworked when this branch was
  cut ("working on landing page changes") — the owner may have unfinished
  intentions there; don't redesign them without asking.
