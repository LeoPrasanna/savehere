import logging
from urllib.parse import urlparse
import httpx
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import create_tables
from app.routes.reels import router as reels_router, recover_pending_summaries
from app.routes.workout import router as workout_router
from app.routes.ask import router as ask_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)

app = FastAPI(title="SaveHere API", version="1.0.0")

# Dev: allow any origin (any localhost port / Codespace tunnel). Production: read
# the allowlist from ALLOWED_ORIGINS (comma-separated). Defaults to "*" so a fresh
# deploy works before the web app's final domain is known — lock it down later.
if settings.ENV == "development":
    CORS_ORIGINS = ["*"]
else:
    CORS_ORIGINS = [o.strip() for o in settings.ALLOWED_ORIGINS.split(",") if o.strip()] or ["*"]

# allow_credentials must be False when origins is "*" (CORS spec). We don't use
# cookie auth yet, so this is safe; revisit when auth lands.
_allow_credentials = "*" not in CORS_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(reels_router)
app.include_router(workout_router)
app.include_router(ask_router)


@app.on_event("startup")
def startup():
    create_tables()
    # Heal summaries orphaned by a previous process death (instant-save runs the
    # summary in an in-process background task that doesn't survive a restart).
    recover_pending_summaries()


@app.get("/health")
def health():
    return {"status": "ok", "service": "SaveHere API"}


# A known-stable, short, public YouTube Short used for the live extraction probe.
_PROBE_URL = "https://www.youtube.com/shorts/SXHMnicI6Pg"


@app.get("/health/extract")
def health_extract(live: bool = False):
    """Reports the installed yt-dlp version (the single biggest factor in save
    success rate). With ?live=1 it runs a real lightweight extraction against a
    known Short so breakage is caught before users hit it — wire this to uptime
    monitoring."""
    import time
    import yt_dlp
    from app.services import extractor

    info = {"status": "ok", "yt_dlp_version": yt_dlp.version.__version__}
    if not live:
        return info

    started = time.monotonic()
    try:
        result = extractor.extract_info(_PROBE_URL)
        ok = bool((result.get("best_text") or "").strip() or result.get("thumbnail_url"))
        info.update({
            "status": "ok" if ok else "degraded",
            "probe_ok": ok,
            "probe_ms": int((time.monotonic() - started) * 1000),
        })
    except Exception as e:
        info.update({"status": "down", "probe_ok": False, "error": f"{type(e).__name__}: {e}"})
    return info


# Image hosts we'll proxy. Restricted to known media CDNs to avoid SSRF.
_THUMB_HOSTS = (
    "fbcdn.net", "cdninstagram.com", "licdn.com", "ytimg.com",
    "tiktokcdn.com", "tiktokcdn-us.com", "twimg.com",
)
_THUMB_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept": "image/avif,image/webp,image/*,*/*;q=0.8",
}


@app.get("/api/thumbnail")
def thumbnail(url: str):
    """Proxy a media-CDN image so it loads on web (Instagram/Facebook CDNs block
    browser hotlinking via CORS). Native loads the URL directly and skips this."""
    host = urlparse(url).netloc.lower()
    if not any(h in host for h in _THUMB_HOSTS):
        raise HTTPException(status_code=400, detail="Host not allowed")
    try:
        r = httpx.get(url, headers=_THUMB_HEADERS, timeout=10, follow_redirects=True)
    except Exception:
        raise HTTPException(status_code=502, detail="Could not fetch image")
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail="Could not fetch image")
    return Response(
        content=r.content,
        media_type=r.headers.get("content-type", "image/jpeg"),
        headers={"Cache-Control": "public, max-age=86400"},
    )
