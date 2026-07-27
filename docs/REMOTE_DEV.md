# Coding SaveHere remotely (Codespaces + Claude Code)

A practical guide to developing SaveHere from anywhere — on a Codespace in the
browser, or with Claude Code in the cloud — including dependencies, credentials,
the gotchas that will bite you, and how to give Claude the right context.

> **First, the honest limitation.** Your **code** lives on GitHub (`develop`) and
> travels everywhere. Your **Claude conversation history and personal memory do
> NOT** — they're stored locally on the machine where you ran them and don't sync
> to GitHub or a Codespace. A fresh environment starts Claude cold. That's exactly
> why this repo carries [`CLAUDE.md`](../CLAUDE.md), [`docs/CONTEXT.md`](CONTEXT.md),
> and [`TODO.md`](../TODO.md) — they ARE the portable context. Point Claude at them.

---

## Which option should I use?

| Option | Best for | Setup | Continuity of *this* repo's context |
|---|---|---|---|
| **Claude Code on the web** (`claude.ai/code`) | Light devices, spotty wifi, quick edits | None — browser only | Reads `CLAUDE.md` + docs from the repo |
| **GitHub Codespaces** + Claude Code | Full IDE in the cloud, running the app | Medium (this guide) | Same — repo files |
| **Local laptop** + Claude Code | Heavy work, keeps your chat + memory | Already set up | Full (local memory persists) |

For travelling: **Claude Code on the web** is the least friction; **Codespaces** if you want to actually run the backend + Expo web.

---

## Part A — GitHub Codespaces

### A1. Create the Codespace
1. On GitHub → the `savehere` repo → **Code ▸ Codespaces ▸ Create codespace on `develop`**.
2. It boots a Linux (Ubuntu) container with VS Code in the browser (or "Open in VS Code Desktop").

### A2. Install dependencies
The container has Python and Node preinstalled, but verify versions: **Python 3.11+** (3.12 ideal), **Node 20+**.

**Backend:**
```bash
cd backend
pip install -r requirements.txt
```
**Mobile:**
```bash
cd ../mobile
npm install
```
**ffmpeg** (only needed for the audio-transcription fallback; skip if you don't test that path):
```bash
sudo apt-get update && sudo apt-get install -y ffmpeg
```

### A3. Credentials (do NOT commit `.env`) — TWO files, both gitignored

There is a **backend `.env`** (repo ROOT — `config.py` walks up from `backend/`, there is
no `backend/.env`) and a **separate `mobile/.env`**. A fresh Codespace clone has **neither**
— you must recreate both, every time, or auth breaks (`supabaseUrl is required` is exactly
this: `mobile/.env` missing). See [`docs/ENVIRONMENTS.md`](ENVIRONMENTS.md) for the full
per-variable matrix; this is the Codespace-specific quick version.

**Root `.env` (backend).** Easiest: copy the content of your **local machine's** root
`.env` into a new file at the Codespace repo root — it's the same values, you already have
them, no need to re-source secrets. Or use **Codespaces Secrets** (GitHub → Settings ▸
Codespaces ▸ Secrets) for `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`,
etc. — rebuild/reopen the Codespace so they're injected.

| Env var | Required? | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | **Yes** | Claude Haiku — summaries, tasks, workout, ask |
| `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | Auth (JWKS verify, admin ops) — point at `savehere-dev` |
| `DATABASE_URL` | **Yes** | `savehere-dev` session-pooler Postgres (SQLite retired for local dev 2026-07-21 — see ENVIRONMENTS.md). Omitting it silently falls back to a Codespace-local SQLite file that won't have your data and won't survive the Codespace being deleted. |
| `OPENAI_API_KEY` / `APIFY_API_KEY` | No | Optional integrations |
| `ENV` | No | `development` (default) |

**`mobile/.env` (frontend) — the file causing your current error.** Create it at
`mobile/.env` with the **public** dev values (safe to paste anywhere — the publishable key
is designed to be shipped in the client bundle; RLS is what actually protects the data):
```
EXPO_PUBLIC_API_URL=<the backend's forwarded Codespace URL — see A5, NOT localhost>
EXPO_PUBLIC_SUPABASE_URL=<savehere-dev project URL, from your local mobile/.env>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<savehere-dev publishable key, from your local mobile/.env>
```
⚠️ **Env vars are read once at Metro bundle time — restart `expo start`, a browser refresh
alone won't pick up a new/changed `.env`.**

### A4. Run the app
**Backend** (terminal 1):
```bash
cd backend
python -m uvicorn app.main:app --reload --port 8000
```
**Mobile web** (terminal 2):
```bash
cd mobile
npx expo start --web
```

### A5. The Codespace networking gotcha (important)
Your Expo web app runs in **your local browser**, but the backend runs in the **Codespace container**. So `http://localhost:8000` from the browser hits *your laptop*, not the Codespace — API calls will fail.

Fix:
1. In the Codespace **Ports** panel, find port **8000** (start the backend first if it's not
   listed yet), copy its forwarded URL (`https://<name>-8000.app.github.dev`), and set its
   visibility to **Public**. Use Public, not Private — `services/api.ts` calls it with
   `fetch`/a Bearer token, not a signed-in browser tab, and Private ports gate on a GitHub
   session cookie that a plain `fetch` won't carry, so the request never reaches FastAPI.
2. Put that URL in `mobile/.env` as `EXPO_PUBLIC_API_URL` (see A3) — same subdomain as the
   frontend's forwarded URL, just the `-8000` port instead of `-8081`.
3. Restart `expo start` (not just a browser refresh — env vars are baked in at bundle time).

> ⚠️ Making port 8000 **public** exposes your (auth-less at the network level — app-level
> auth via Supabase JWT is required, but anyone can reach the endpoint) backend to the
> internet for that session. **Set it back to Private when done**, and don't leave a public
> Codespace running.

### A6. Tests
```bash
cd backend && python -m pytest tests/ -q
```

---

## Part B — Claude Code in the Codespace (or anywhere)

### B1. Install
- **VS Code extension:** open Extensions in the Codespace, search **"Claude Code"**, install. Or
- **CLI:** `npm install -g @anthropic-ai/claude-code` then run `claude`.
  *(Install commands evolve — confirm at https://docs.claude.com/claude-code.)*

### B2. Sign in
Run `claude` and use `/login` (browser/device OAuth). Don't rely on `ANTHROPIC_API_KEY` for Claude Code auth unless you intend to bill that key — `/login` uses your Claude subscription.

### B3. Give Claude the context (the part that makes it useful)
A fresh Claude session here will **not** know this chat. It will, however, auto-read [`CLAUDE.md`](../CLAUDE.md). Kick off each session with:

> "Read `docs/CONTEXT.md` and `TODO.md`, then tell me where the project is and what the next step is before changing anything."

- `CLAUDE.md` (repo root) — working style, quality bar, conventions. **Auto-loaded.**
- `docs/CONTEXT.md` — architecture, decisions, gotchas, next steps.
- `TODO.md` — the prioritized, categorized backlog and release gate.

### B4. Your personal advisor rules + memory
Your global `~/.claude/CLAUDE.md` (advisor persona) and the local memory files **don't travel**. A condensed version of the working style is baked into this repo's `CLAUDE.md` so it applies anywhere. If you want the full personal setup in a Codespace, recreate `~/.claude/CLAUDE.md` there (it's per-machine).

### B5. Claude Code on the web
`claude.ai/code` connects to your GitHub repo and runs in the cloud — same context model (reads `CLAUDE.md` + docs), nothing to install. Best for travelling on a light device.

---

## Part C — Best practices & situations to AVOID

**Do**
- **Commit and push often.** A Codespace is deleted after its retention window (default ~30 days) and uncommitted work goes with it. `git push origin develop` is your save button.
- **Stop the Codespace when idle** (it auto-stops after ~30 min) — the free tier is metered in core-hours.
- Use **Codespaces Secrets** for keys; verify `.env` is gitignored (it is) before any `git add`.
- Run `npm run typecheck` and `python -m pytest tests/ -q` before pushing.
- Branch off `develop`; end commits with the `Co-Authored-By: Claude Opus 4.8` line.

**Avoid**
- ❌ **Committing `.env` / keys.** Never. The `.gitignore` covers `.env`, `*.db`, `node_modules` — keep it that way.
- ❌ **Pasting API keys into the Claude chat.** Put them in Secrets/`.env` only.
- ❌ **Leaving backend port 8000 public.** App-level auth (Supabase JWT) is required per-route, but the network port itself has no gate — set it back to Private after testing.
- ❌ **Assuming your data won't follow you.** Decision 2026-07-20/21: local dev, Codespaces, and staging all point at the **same** `savehere-dev` Postgres (SQLite is retired for local dev specifically so this works) — your saves DO persist and DO show up in every environment pointed at `savehere-dev`. Don't accidentally point a Codespace at `SaveHere` (prod) trying to "get your real data" — auth users are per-project, so a prod `DATABASE_URL` there would be reachable but pointless (your dev-project login can't own prod rows) and risks writing test traffic into production.
- ❌ **Letting a fresh Claude session run blind.** Always point it at `docs/CONTEXT.md` + `TODO.md` first, or it'll re-derive (or wrongly guess) decisions already made.
- ❌ **Editing Expo code from memory.** SDK 56 changed APIs — check `https://docs.expo.dev/versions/v56.0.0/` (see `mobile/AGENTS.md`).

---

## Part D — Next steps to follow

Don't duplicate the backlog here — it drifts out of sync (this section used to list
"Auth + per-user data" and "migrate SQLite→Postgres" as upcoming; both shipped long ago).
**[`TODO.md`](../TODO.md)**'s **"▶ CURRENT FOCUS"** banner at the top is the single source
of truth for what's active right now, and the full checklist below it is the release gate.

A good first task in a new environment: tell Claude to read `docs/CONTEXT.md` +
`TODO.md`, then pick up at the CURRENT FOCUS item.
