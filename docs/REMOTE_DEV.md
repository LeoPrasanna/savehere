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

### A3. Credentials (do NOT commit `.env`)
`backend/app/config.py` reads from a `.env` file **or** real environment variables (`os.getenv`), so either works. Prefer **Codespaces Secrets** — they're encrypted and never in git:

1. GitHub → **Settings ▸ Codespaces ▸ Secrets ▸ New secret**.
2. Add `ANTHROPIC_API_KEY` (required). Optionally `OPENAI_API_KEY` (Whisper), `APIFY_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
3. Scope the secret to the `savehere` repo. Rebuild/reopen the Codespace so it's injected as an env var.

Alternatively, copy the template locally inside the Codespace (it stays gitignored):
```bash
cd backend && cp ../.env.example .env   # then edit .env and paste your key
```

| Env var | Required? | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | **Yes** | Claude Haiku — summaries, tasks, workout, ask |
| `OPENAI_API_KEY` | No | Whisper transcription fallback (needs ffmpeg) |
| `APIFY_API_KEY` | No | (future) LinkedIn scraping |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | No (future) | auth, once built |
| `ENV` | No | `development` (default) |

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
1. In the Codespace **Ports** panel, find port **8000**, copy its forwarded URL (looks like `https://<name>-8000.app.github.dev`), and set its visibility to **Public** (or keep Private and stay signed in).
2. Set the mobile app to use it before starting Expo:
   ```bash
   cd mobile
   EXPO_PUBLIC_API_URL="https://<name>-8000.app.github.dev" npx expo start --web
   ```
   (`services/api.ts` reads `EXPO_PUBLIC_API_URL`, falling back to localhost.)
3. Also forward Expo's web port (**8081**) to open the app.

> ⚠️ Making port 8000 **public** exposes your (currently auth-less, AI-key-backed) backend to the internet for that session. The rate limits help, but **set it back to Private when done**, and don't leave a public Codespace running.

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
- ❌ **Leaving backend port 8000 public.** No auth yet — set it back to Private after testing.
- ❌ **Treating the SQLite `savehere.db` as real data.** It's local/dev and gitignored; it won't follow you between Codespaces. Don't build anything assuming it persists.
- ❌ **Letting a fresh Claude session run blind.** Always point it at `docs/CONTEXT.md` + `TODO.md` first, or it'll re-derive (or wrongly guess) decisions already made.
- ❌ **Editing Expo code from memory.** SDK 56 changed APIs — check `https://docs.expo.dev/versions/v56.0.0/` (see `mobile/AGENTS.md`).

---

## Part D — Next steps to follow

The current backlog, in priority order (full detail in [`TODO.md`](../TODO.md)):
1. **Anthropic console monthly budget cap** — owner action; the only hard cost ceiling today.
2. **Auth + per-user data** (Supabase) — users table, `user_id` everywhere, per-user filtering + ownership checks, per-user AI quota (replaces the interim per-IP daily cap). Biggest pure-code unlock; gates tiers/referrals/quota.
3. **Deploy backend** (Railway/Render) → set `EXPO_PUBLIC_API_URL` to it, lock CORS, migrate SQLite→Postgres.
4. **iOS share extension** (Mac/EAS) — the core "share to SaveHere" capture flow.
5. **Pricing/IAP** in App Store Connect — regional prices, India ₹59×3 intro offer, `SAVEHEREFIRST` code.

A good first task in a new environment: tell Claude to read the context files and pick up at the highest-priority unchecked item.
