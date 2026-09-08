"""Interactive dev server — the REAL Findable app, no Supabase login required.

For local/Codespace UI testing only. It:
  • overrides auth to a single fixed dev user (so there's no login wall — we have
    no Supabase creds in this environment),
  • uses a persistent dev SQLite DB, seeded once with sample reels,
  • keeps REAL extraction + Claude summaries (save/resummarize/tasks/workout/ask
    all actually work — subject to the known datacenter-IP extraction limits),
  • serves the exported web bundle same-origin at / with an SPA fallback,
  • exposes /dev-login, which plants a forged Supabase session in localStorage
    (same origin → shared storage) so the app's auth gate lets you straight in.

Run:  DATABASE_URL=sqlite:////tmp/savehere-dev.db python dev_server.py
Then open the forwarded port-8000 URL and hit /dev-login once.
"""
import os
import sys

assert os.environ.get("DATABASE_URL", "").startswith("sqlite:////tmp/"), \
    "Set DATABASE_URL to a sqlite:////tmp/... path so we never touch the real DB."

sys.path.insert(0, os.path.dirname(__file__))

import json
from datetime import datetime, timedelta

import uvicorn
from fastapi import Response
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from app.main import app
from app.database import Base, ReelDB, engine, SessionLocal
from app.auth import get_current_user, AuthUser

DEV_USER_ID = "dev-user-0001"
DEV_EMAIL = "dev@savehere.local"

# Two modes, chosen by env:
#   BYPASS (default): no Supabase login — auth is overridden to a seeded dev user,
#           and /dev-login plants a fake session so the app's gate opens.
#   REAL   (SAVEHERE_DEV_BYPASS=0): real Supabase auth; you log in through the app.
BYPASS = os.environ.get("SAVEHERE_DEV_BYPASS", "1") != "0"
# Which exported web bundle to serve (built with the matching env).
WEB_DIR = os.environ.get("DEV_WEB_DIR", "dist-dev")

# ── 1. Login wall on/off ─────────────────────────────────────────────────────
if BYPASS:
    app.dependency_overrides[get_current_user] = lambda: AuthUser(id=DEV_USER_ID, email=DEV_EMAIL)

# ── 2. Seed the dev DB once (bypass mode only) ───────────────────────────────
Base.metadata.create_all(bind=engine)
_db = SessionLocal()
if BYPASS and _db.query(ReelDB).filter(ReelDB.user_id == DEV_USER_ID).count() == 0:
    now = datetime.utcnow()
    seeds = [
        ("Perfect creamy pasta in 15 minutes", "cooking", "instagram",
         ["Boil pasta in well-salted water", "Emulsify sauce with a splash of pasta water", "Finish off the heat with cheese"],
         ["pasta", "quick", "dinner"]),
        ("5 dumbbell moves for a bigger back", "fitness", "youtube",
         ["Bent-over rows build thickness", "Control the negative on every rep", "Single-arm rows fix imbalances"],
         ["gym", "back", "dumbbell"]),
        ("The 50/30/20 budgeting rule", "finance", "tiktok",
         ["50% of income to needs", "30% to wants", "20% to savings and debt"],
         ["money", "budget"]),
        ("Tokyo in 3 days — first-timer itinerary", "travel", "youtube",
         ["Day 1: Shibuya + Shinjuku", "Day 2: Asakusa + Akihabara", "Day 3: day trip to Hakone"],
         ["japan", "itinerary"]),
        ("React state explained in 60 seconds", "tech", "instagram",
         ["useState holds local component state", "Lift state up when it's shared", "Derive, don't duplicate"],
         ["react", "webdev"]),
        ("Start before you feel ready", "motivation", "tiktok",
         ["Action comes before motivation", "Momentum is built, not found"],
         ["mindset", "discipline"]),
    ]
    for i, (title, cat, platform, summary, tags) in enumerate(seeds):
        _db.add(ReelDB(
            id=f"dev-seed-{i}", user_id=DEV_USER_ID, url=f"https://example.com/dev-{i}",
            platform=platform, title=title, summary=summary, tags=tags, category=cat,
            summary_status="ready", notes=None, created_at=now - timedelta(hours=i),
        ))
    _db.commit()
_db.close()

# ── 3. /dev-login: plant a forged Supabase session, then bounce to the app ───
# The key `sb-fake-auth-token` matches the project ref of the fake Supabase URL
# the bundle was built with (https://fake.supabase.co → ref "fake").
_SESSION = {
    "access_token": "dev.fake.jwt",
    "refresh_token": "dev-refresh",
    "token_type": "bearer",
    "expires_in": 60 * 60 * 24 * 365,
    "expires_at": int(datetime.utcnow().timestamp()) + 60 * 60 * 24 * 365,
    "user": {
        "id": DEV_USER_ID, "aud": "authenticated", "role": "authenticated",
        "email": DEV_EMAIL, "created_at": "2026-01-01T00:00:00Z",
        "app_metadata": {"provider": "email"},
        "user_metadata": {"nickname": "Dev"},
    },
}


@app.get("/dev-login", response_class=HTMLResponse)
def dev_login():
    payload = json.dumps(_SESSION)
    return f"""<!doctype html><meta charset=utf-8>
<title>Findable dev login</title>
<body style="font-family:system-ui;background:#0B0A0F;color:#F5F0E8;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center">
<div style="font-size:20px;font-weight:700">Signing you in as the dev user…</div>
<div style="opacity:.6;margin-top:8px">Redirecting to the library.</div>
</div>
<script>
  localStorage.setItem('sb-fake-auth-token', JSON.stringify({payload}));
  localStorage.setItem('@savehere:onboarded:v1:{DEV_USER_ID}', '1');
  location.replace('/');
</script></body>"""


# ── 4. Serve the exported web bundle same-origin, with SPA fallback ──────────
_DIST = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "mobile", WEB_DIR))
_INDEX = os.path.join(_DIST, "index.html")

# Static asset dirs (hashed bundles + images). Mount before the catch-all.
if os.path.isdir(os.path.join(_DIST, "_expo")):
    app.mount("/_expo", StaticFiles(directory=os.path.join(_DIST, "_expo")), name="expo")
if os.path.isdir(os.path.join(_DIST, "assets")):
    app.mount("/assets", StaticFiles(directory=os.path.join(_DIST, "assets")), name="assets")


@app.get("/{full_path:path}")
def spa(full_path: str):
    """Any non-API path serves a real file if present, else index.html (client
    routing). API/health routes are registered earlier so they win over this."""
    candidate = os.path.normpath(os.path.join(_DIST, full_path))
    if candidate.startswith(os.path.abspath(_DIST)) and os.path.isfile(candidate):
        return FileResponse(candidate)
    if os.path.isfile(_INDEX):
        return FileResponse(_INDEX)
    return Response("Web bundle not built. Run the dist-dev export first.", status_code=503)


if __name__ == "__main__":
    mode = "BYPASS (no login — visit /dev-login)" if BYPASS else "REAL Supabase auth (log in via the app)"
    print(f"\n  Findable dev server\n  mode: {mode}\n  web bundle: mobile/{WEB_DIR}\n  → open the forwarded :8000 URL\n")
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
