# SaveHere

> Save any Reel, Short, or Post. Get an AI summary instantly.

SaveHere is a mobile app (iOS-first) that acts as a central hub for saving short-form content from Instagram, YouTube, TikTok, and LinkedIn. Share a URL from any app and SaveHere extracts the content, generates bullet-point summaries using Claude AI, and lets you add personal notes — all in one dark, minimal interface.

---

## Features

- **One-tap save** — share a URL directly from Instagram, YouTube, TikTok, or LinkedIn
- **AI summaries** — Claude Haiku extracts key insights as bullet points, not generic fluff
- **Multi-language** — works with content in any language; summaries match the source language
- **Personal notes** — auto-saved notes with 1-second debounce
- **Re-summarize** — up to 3 attempts per item with a fresh AI pass
- **Filter & search** — filter by category chip or search by title/tag
- **LinkedIn fallback** — paste post text into Notes when login wall blocks extraction

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Mobile | React Native + Expo SDK 56 (expo-router) |
| Backend | FastAPI (Python 3.12) + SQLAlchemy |
| Database | SQLite (dev) → Supabase Postgres (prod) |
| AI | Anthropic Claude Haiku (`claude-haiku-4-5-20251001`) |
| Extraction | yt-dlp + WebVTT caption parser |
| Transcription | OpenAI Whisper (optional) |

---

## Prerequisites

- Python 3.12+
- Node.js 18+
- [ffmpeg](https://ffmpeg.org/) on PATH (for audio extraction fallback)
- Anthropic API key

---

## Quick Start

### 1. Clone and configure

```bash
git clone https://github.com/YOUR_USERNAME/savehere.git
cd savehere
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
```

### 2. Backend

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Backend runs at `http://localhost:8000`. API docs at `http://localhost:8000/docs`.

### 3. Mobile (Expo Web for local dev)

```bash
cd mobile
npm install
npx expo start --web --clear
```

Open `http://localhost:8082` in your browser.

---

## Environment Variables

Copy `.env.example` to `.env`. Only `ANTHROPIC_API_KEY` is required to run locally.

| Variable | Required | Description |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Yes | Claude Haiku for summarization and tagging |
| `OPENAI_API_KEY` | No | Whisper API for audio transcription fallback |
| `APIFY_API_KEY` | No | Apify LinkedIn scraper (alternative to login-walled extraction) |
| `SUPABASE_URL` | Prod only | Supabase project URL |
| `SUPABASE_ANON_KEY` | Prod only | Supabase anon key |
| `ENV` | No | `development` (default) or `production` |

---

## Project Structure

```text
savehere/
├── backend/
│   ├── app/
│   │   ├── config.py          # Settings from .env
│   │   ├── database.py        # SQLAlchemy models + migrations
│   │   ├── main.py            # FastAPI app, CORS, startup
│   │   ├── models/
│   │   │   └── reel.py        # Pydantic request/response schemas
│   │   ├── routes/
│   │   │   └── reels.py       # All /api/reels endpoints
│   │   └── services/
│   │       ├── extractor.py   # yt-dlp + VTT caption extraction
│   │       ├── summarizer.py  # Claude Haiku prompt + JSON parsing
│   │       └── transcriber.py # Whisper audio transcription
│   └── requirements.txt
│
├── mobile/
│   ├── app/
│   │   ├── _layout.tsx        # Stack navigator + header styles
│   │   ├── index.tsx          # Home screen: grid, filters, search
│   │   ├── save.tsx           # URL input + save flow
│   │   └── reel/[id].tsx      # Detail: summary, notes, re-summarize
│   ├── components/
│   │   ├── ReelCard.tsx       # Grid card (thumbnail, title, 1 bullet, tags)
│   │   └── TagBadge.tsx       # Tag pill component
│   ├── constants/
│   │   └── theme.ts           # Dark theme colors, spacing, font sizes
│   └── services/
│       └── api.ts             # All backend API calls
│
├── .env.example
├── .gitignore
├── TODO.md
└── README.md
```

---

## API Reference

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/reels/save` | Extract, summarize, and save a URL |
| `GET` | `/api/reels` | List saved reels (filter by tag, category, platform) |
| `GET` | `/api/reels/{id}` | Get a single reel |
| `POST` | `/api/reels/{id}/resummarize` | Re-run AI summary (max 3 per reel) |
| `PATCH` | `/api/reels/{id}/notes` | Update personal notes |
| `DELETE` | `/api/reels/{id}` | Delete a saved reel |

---

## Supported Platforms

| Platform | Extraction | Captions | Audio fallback |
| --- | --- | --- | --- |
| YouTube Shorts | ✅ | ✅ Auto-captions (all languages) | ✅ |
| Instagram Reels | ✅ | ⚠️ Public only | ✅ |
| TikTok | ✅ | ⚠️ Partial | ✅ |
| LinkedIn posts | ⚠️ Paste text in Notes | ❌ Login-walled | ❌ |

> Videos longer than 10 minutes are rejected — SaveHere is built for short-form content.

---

## Roadmap

See [TODO.md](TODO.md) for the full prioritised checklist.

---

## License

MIT
