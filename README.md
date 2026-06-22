<div align="center">

<img src="mobile/assets/icon.png" width="104" alt="SaveHere logo" />

# SaveHere

**Save any Reel, Short, or Post — get an instant AI summary, then turn it into action.**

![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)
![Expo](https://img.shields.io/badge/Expo-SDK%2056-000020?logo=expo&logoColor=white)
![Claude](https://img.shields.io/badge/AI-Claude%20Haiku-D97757)
![License](https://img.shields.io/badge/license-MIT-green)

</div>

---

SaveHere is an **iOS-first mobile app** (Android next) that turns the short-form content you save into a searchable, actionable second brain. Share a link from Instagram, YouTube, TikTok, LinkedIn, or Facebook and SaveHere extracts the content, generates a **bullet-point AI summary and tags** with Claude, and then lets you **act on it** — step-by-step recipes, task checklists, workout plans — **search** it, **rediscover** forgotten saves, and **ask your whole library** questions answered only from what you saved.

---

## ✨ Highlights

### Capture & summarize

- One-tap save from Instagram, YouTube, TikTok, LinkedIn, Facebook
- AI bullet summaries + auto tags + auto category (Claude Haiku) — grounded in the actual captions/transcript, never invented
- Works in any language; summaries match the source
- Auto-saved personal notes; editable category; re-summarize (capped)
- Graceful handling of login-walled posts (saved as a labelled bookmark to annotate)

### Turn it into action

- 🍳 **Recipes & checklists** — step-by-step instructions extracted from how-to / cooking content
- 🏋️ **Workout plans** — exercises with sets/reps/rest, plus a guided session player
- ✍️ **Manual control** — AI generates once, then you add / edit / delete items yourself (no repeat AI cost)

### Find & rediscover

- 🔍 **Search** across titles, tags, summaries, and notes
- 🧭 **Rediscover** — resurfaces older saves so they don't get forgotten
- 💬 **Ask your library** — natural-language questions answered from your own saves, with sources

### Reliability & cost control

- Extraction cache (re-saving is instant and never re-hits the platform) with TTL eviction
- Per-IP rate limiting, per-reel AI caps, and a daily cap on the ask endpoint to bound API spend
- `/health` and `/health/extract` self-test endpoints; image proxy for CDN-blocked thumbnails
- Backend test suite (pytest)

---

## 🧱 Tech stack

| Layer | Technology |
| --- | --- |
| Mobile | React Native + **Expo SDK 56** (expo-router), Reanimated, Moti, Lucide icons |
| Backend | **FastAPI** (Python 3.12) + SQLAlchemy |
| Database | SQLite (dev) → Supabase Postgres (planned for prod) |
| AI | Anthropic **Claude Haiku** (`claude-haiku-4-5-20251001`) |
| Extraction | yt-dlp (+ WebVTT caption parser, JSON-LD / Open Graph fallback) |
| Transcription | OpenAI Whisper (optional, audio fallback) |

---

## 🚀 Quick start

### Prerequisites

- Python **3.12+**, Node **20+**
- An **Anthropic API key**
- [ffmpeg](https://ffmpeg.org/) on PATH (optional — only for the audio-transcription fallback)

### 1. Clone & configure

```bash
git clone https://github.com/LeoPrasanna/savehere.git
cd savehere
cp .env.example .env          # then edit .env and add your ANTHROPIC_API_KEY
```

### 2. Backend

```bash
cd backend
pip install -r requirements.txt          # (a virtualenv is optional but recommended)
python -m uvicorn app.main:app --reload --port 8000
```

API runs at `http://localhost:8000` · interactive docs at `http://localhost:8000/docs`.

### 3. Mobile (Expo Web for local dev)

```bash
cd mobile
npm install
npx expo start --web
```

The app calls `http://localhost:8000` by default. To point it elsewhere (e.g. a cloud backend), set `EXPO_PUBLIC_API_URL` before starting Expo.

> **Coding remotely / while travelling?** See **[docs/REMOTE_DEV.md](docs/REMOTE_DEV.md)** for GitHub Codespaces + Claude Code setup.

---

## 🔐 Environment variables

Copy `.env.example` → `.env`. Only `ANTHROPIC_API_KEY` is required to run locally. **Never commit `.env`.**

| Variable | Required | Description |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | **Yes** | Claude Haiku — summaries, tags, recipes, workouts, ask |
| `OPENAI_API_KEY` | No | Whisper audio-transcription fallback (needs ffmpeg) |
| `APIFY_API_KEY` | No | (future) LinkedIn scraping |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | Prod (future) | Auth + Postgres, once built |
| `ENV` | No | `development` (default) or `production` |

---

## 🗂️ Project structure

```text
savehere/
├── backend/                       # FastAPI + SQLAlchemy
│   ├── app/
│   │   ├── main.py                # app, CORS, /health, /health/extract, thumbnail proxy
│   │   ├── config.py              # settings (.env or env vars)
│   │   ├── database.py            # SQLAlchemy models + lightweight migrations
│   │   ├── ratelimit.py           # per-IP burst + daily rate limiting
│   │   ├── routes/                # reels, workout (tasks/recipes + workouts), ask
│   │   └── services/              # extractor, summarizer, workout_extractor, librarian, transcriber
│   └── tests/                     # pytest suite
├── mobile/                        # Expo Router app
│   ├── app/                       # library, save, reel detail, ask, rediscover, help, workout
│   ├── components/                # ReelCard, TaskList, Landing, ProfilePanel, Icon, …
│   ├── constants/                 # theme, features
│   └── services/api.ts            # typed API client
├── docs/
│   ├── CONTEXT.md                 # architecture + decisions handoff
│   └── REMOTE_DEV.md              # Codespaces + Claude Code setup guide
├── CLAUDE.md                      # project instructions for Claude Code
├── TODO.md                        # prioritized roadmap / release checklist
└── .env.example
```

---

## 📡 API reference

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/reels/save` | Extract, summarize, and save a URL |
| `GET` | `/api/reels` | List saved reels (filter by tag / category / platform) |
| `GET` | `/api/reels/{id}` | Get a single reel |
| `POST` | `/api/reels/{id}/resummarize` | Re-run the AI summary (capped) |
| `PATCH` | `/api/reels/{id}/notes` | Update personal notes |
| `PATCH` | `/api/reels/{id}/category` | Set the category |
| `DELETE` | `/api/reels/{id}` | Delete a saved reel |
| `POST` | `/api/reels/{id}/tasks` | Generate step-by-step tasks / recipe (AI, once) |
| `POST` | `/api/reels/{id}/tasks/manual` | Add a task/step by hand |
| `PATCH` / `DELETE` | `/api/tasks/{id}` | Toggle / edit / delete a task |
| `POST` | `/api/reels/{id}/workout` | Generate a workout plan (capped) |
| `PATCH` | `/api/exercises/{id}` | Edit an exercise |
| `POST` | `/api/ask` | Ask a question answered from your library |
| `GET` | `/health` · `/health/extract` | Service + extraction self-test |

---

## 🎬 Supported platforms

| Platform | Extraction | Captions / text | Audio fallback |
| --- | --- | --- | --- |
| YouTube Shorts | ✅ | ✅ Auto-captions (all languages) | ✅ |
| Instagram Reels | ✅ | ⚠️ Public only | ✅ |
| TikTok | ✅ | ⚠️ Partial | ✅ |
| LinkedIn posts | ✅ (JSON-LD) | ⚠️ Login-walled → paste text in Notes | — |
| Facebook reels | ⚠️ Bookmark | ⚠️ Login-walled | — |

> Videos longer than 10 minutes are rejected — SaveHere is built for short-form content.

---

## 💸 AI cost controls

Every AI feature spends Claude tokens, so usage is bounded by design:

- **Per-reel caps** — recipes/tasks generate once (then edit by hand), workouts ×3, re-summarize ×3.
- **Ask-your-library** sends only the most relevant saves to the model (retrieval), not the whole library.
- **Rate limiting** — per-IP burst limit on all AI endpoints + a **daily cap** on `/api/ask`.

> These are interim, per-IP guardrails. Per-user quotas (and the paywall tiers) arrive with authentication — see [TODO.md](TODO.md) and [docs/CONTEXT.md](docs/CONTEXT.md).

---

## 🧪 Testing

```bash
cd backend && python -m pytest tests/ -q     # backend unit tests
cd mobile  && npm run typecheck              # mobile type check
```

---

## 🗺️ Roadmap

Authentication + per-user data, deployment, the iOS share extension, and subscription tiers are tracked in **[TODO.md](TODO.md)**. Architecture and the reasoning behind key decisions live in **[docs/CONTEXT.md](docs/CONTEXT.md)**.

---

## 📄 License

[MIT](mobile/LICENSE)
