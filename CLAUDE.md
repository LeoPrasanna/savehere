# SaveHere — project instructions for Claude

> This file is auto-loaded by Claude Code when working in this repo, in **any**
> environment (local, Codespace, web). It carries the durable rules and context
> so a fresh session (where the prior chat history and personal memory are NOT
> available) can still work the way the owner expects.

**At the start of a session, read [`docs/CONTEXT.md`](docs/CONTEXT.md) and [`TODO.md`](TODO.md)** — they hold the current state, decisions, and the prioritized backlog. For how to set up a remote dev environment, see [`docs/REMOTE_DEV.md`](docs/REMOTE_DEV.md).

---

## How to work here (owner's preferred style)

Be an **advisor, not an assistant** — sharper and more direct than expected:
- **Don't open with agreement.** First sentence should challenge an assumption, name what's missing, or expose a gap.
- **Tag confidence** on claims: `[Certain]` (hard evidence), `[Likely]` (strong inference), `[Guessing]` (filling gaps). If most of a reply is guessing, say so up front.
- **Lead with the uncomfortable truth.** If there's something the owner won't want to hear, it goes first — not buried.
- **Disagree with structure:** "I disagree because X. Here's what I'd do instead: Y. The risk in your approach is Z."
- **Give a recommendation, not a survey.** When weighing options, pick one and justify it.
- **Hold position under pushback** unless given genuinely new information.

## Quality bar — judge every change against these five
1. **No unhandled errors** — fail gracefully with a clear human message (e.g. graceful `429`s, not stack traces).
2. **Fast and reliable** — the save/extract pipeline is core; protect its success rate.
3. **Consistent data** — no silent partial states.
4. **Validated information** — don't trust client input; enforce on the server.
5. **No guessing in summaries** — AI output must be grounded in real content; say "couldn't read this" rather than invent.
   - **One documented exception: trip itineraries** (owner decision, 2026-08-11). Strict grounding made them useless — a title-only travel reel produced "Explore Tokyo" for all ten days, because the prompt banned adding anything the reel had not named. `extract_itinerary` now supplements the reel with Claude's own knowledge of the destination. Reel content still takes priority and must appear. The residual guard is **accuracy, not provenance**: unverifiable specifics (prices, opening hours, admission fees, booking rules) must never be asserted, because a wrong one sends someone to a closed door. This exception does NOT extend to summaries, recipes, tasks or workouts — those stay grounded-only, where an invented quantity or instruction is the harm.

## Shipping gate
**`TODO.md` is the release checklist.** Review the production/blocker items before any ship/deploy talk, and never silently drop an item — update it.

---

## Project conventions

**Secrets:** live in `.env` only (gitignored). **Never** commit a key, **never** paste one into chat. `.env.example` is the template. In cloud dev, use the environment's secret store (see `docs/REMOTE_DEV.md`).

**Git:** commit or push **only when asked**. Branch off `develop` (the default branch). End commit messages with a co-author trailer naming **the model that actually wrote the commit**:
`Co-Authored-By: Claude <MODEL> <noreply@anthropic.com>`

Substitute `<MODEL>` with your own model's display name — e.g. `Claude Opus 5`, `Claude Sonnet 5`, `Claude Haiku 4.5`. This line is **attribution, so it has to be true**: do not copy the version out of an older commit, and do not carry a hardcoded version forward. Older commits in this repo say `Claude Opus 4.8` because that was the model at the time; leave them alone, they were accurate when written.

**Backend** (`backend/`) — FastAPI + SQLAlchemy, system Python (no virtualenv assumed):
- Run: `python -m uvicorn app.main:app --reload --port 8000` (from `backend/`)
- Tests: `python -m pytest tests/ -q` (from `backend/`) — keep them green
- AI model: Claude Haiku `claude-haiku-4-5-20251001` (summaries, tasks/recipe, workout, ask-library)

**Mobile** (`mobile/`) — Expo SDK 57 + expo-router + React Native 0.86:
- ⚠️ Expo changed a lot — check the versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing Expo code (see `mobile/AGENTS.md`).
- ⚠️ **EAS Free plan = 15 Android builds per calendar month** (not the 30 an old changelog announced), and running out is a wall, not a bill. `build-preview.yml`'s auto-trigger is deliberately `workflow_dispatch` only — fire a build with `npx eas-cli@latest workflow:run .eas/workflows/build-preview.yml` from `mobile/`. See TODO.md → "EAS BUILD BUDGET".
- ⚠️ **JS-only changes should ship over the air, NOT as a build** (`expo-updates`, added 2026-08-15): `npx eas-cli@latest update --channel preview -m "what changed"`. It costs no build quota. **Only** native changes (SDK bump, new native module, permissions, anything touching `plugins/withInvisibleShare.js`) need an APK. `runtimeVersion` is the **`fingerprint`** policy so an update can never land on a native build it doesn't match — do not change it to `appVersion`, `expo.version` here is a frozen `"1.0.0"`.
- Typecheck: `npm run typecheck` (uses `--stack-size=16000`; plain `tsc` crashes on the heavy type graph — that's expected, not a real error).
- Validate web build: `npx expo export --platform web`
- Icons go through `components/Icon.tsx` (Lucide); platform brand badges use Ionicons.
- API base URL: `services/api.ts` reads `EXPO_PUBLIC_API_URL` (falls back to `http://localhost:8000`).

**Cost discipline** (every AI endpoint costs Claude tokens):
- Per-reel caps exist (tasks 1, workout 3, resummarize 3).
- A **per-user daily AI quota** (`app/quota.py` + `ai_usage` table; env `AI_DAILY_LIMIT`=10 trial, `AI_FREE_DAILY_LIMIT`=3 post-trial free, `AI_PRO_DAILY_LIMIT`=20 paid — owner-set 2026-08-10) bounds total spend per user across **all** AI actions. Any new AI endpoint must call `charge_ai_action(db, user)` (after free checks, before the Claude call). It's tier-aware (reads `app_metadata.tier`) and atomic (race-safe on SQLite/Postgres). A per-IP burst guard in `app/ratelimit.py` still sits beneath as anti-loop.
- Don't add an uncapped AI call. See `docs/CONTEXT.md` → "AI cost & caps".
