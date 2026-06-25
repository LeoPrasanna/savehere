# Deploying SaveHere

This deploys the **backend** to a stable URL so it survives Codespace/session
teardown (the recurring "Can't reach the server" pain). The **web frontend** is a
separate, smaller step — see the last section.

> What's automated vs. yours: the repo is deploy-ready (`render.yaml`, env-driven
> config). **You** connect the repo in your cloud account and set the secrets —
> those never live in git or in chat.

---

## Recommended: Render (Blueprint)

Free tier = a stable public URL at $0 (with cold starts). Steps:

1. **Push this branch / merge to `develop`** so `render.yaml` is on the branch you'll deploy.
2. Go to **render.com → New → Blueprint** and connect the `LeoPrasanna/savehere` repo.
   Render reads [`render.yaml`](../render.yaml) and proposes the `savehere-api` web service.
3. **Set the secret:** in the service's **Environment**, add `ANTHROPIC_API_KEY`
   (and optionally `OPENAI_API_KEY`, `APIFY_API_KEY`). These are `sync:false` in
   the blueprint, so they MUST be entered here.
4. **Apply / Deploy.** First build installs `backend/requirements.txt` and starts
   `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
5. **Verify:** open `https://<your-service>.onrender.com/health` → `{"status":"ok"}`.
   Also `…/health/extract` shows the yt-dlp version.
6. **Point the app at it:** set `EXPO_PUBLIC_API_URL=https://<your-service>.onrender.com`
   when running/building the mobile app ([mobile/services/api.ts](../mobile/services/api.ts) reads it).
7. **(Later) lock CORS:** once the web app has a fixed domain, set `ALLOWED_ORIGINS`
   to that origin instead of `*`.

---

## Caveats — read before relying on it

- **Cold starts (free tier).** The service sleeps after ~15 min idle; the next
  request takes ~30–60 s to wake. That hurts the "instant save" feel. Fix: Render
  **Starter ($7/mo)** for always-on, or Railway (below).
- **Ephemeral filesystem → SQLite data resets** on every deploy/restart. Fine for
  testing; **not** for real use. The real fix is **Postgres + auth** (see
  `TODO.md` / `docs/CONTEXT.md`): set `DATABASE_URL` to a Postgres URL and the code
  picks it up with no change (driver is auto-selected, SQLite-only flags are guarded).
- **Extraction from a datacenter IP is worse, not better.** `[Certain]` Render/Railway
  IPs are bot-blocked by YouTube/Instagram at least as hard as the Codespace. What
  still works without a proxy: YouTube **oEmbed** (title/thumbnail) and the
  **`facebookexternalhit`** caption path for IG/FB. Full **transcripts** will mostly
  fail until a **residential proxy** is added (see CONTEXT §4 "Extraction & bot-detection").
  Deploying does not fix extraction — it fixes uptime.
- **No ffmpeg in the native Python env** → audio transcription (the optional Whisper
  fallback) is disabled. Use a Docker deploy if you need it.

---

## Alternative: Railway

Always-on, ~$5/mo (no real free tier), supports volumes for persistent SQLite.

1. railway.app → **New Project → Deploy from GitHub repo** → pick the repo.
2. Set **Root Directory** = `backend`.
3. **Start command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
4. Add variables: `ENV=production`, `ALLOWED_ORIGINS`, `ANTHROPIC_API_KEY`.
5. (Optional) add a **Volume** mounted where `savehere.db` lives to persist SQLite.

---

## Frontend (next step — not done here)

This guide deploys the API only. To get the **web app** off the Codespace too:

1. `cd mobile && EXPO_PUBLIC_API_URL=https://<your-service>.onrender.com npx expo export --platform web`
2. Deploy the generated `dist/` to any static host — **Render Static Site**,
   Netlify, or Vercel. The API URL is baked in at export time, so re-export if it changes.

Ask and I'll wire this up once the backend URL exists.
