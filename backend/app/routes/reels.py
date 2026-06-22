from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
import uuid
import re
import time
import logging
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout

from app.database import get_db, ReelDB, ExtractionCacheDB
from app.models.reel import ReelSaveRequest, ReelNotesRequest, ReelCategoryRequest, ReelResponse, ReelListResponse
from app.services import extractor, transcriber, summarizer
from app.ratelimit import rate_limit

logger = logging.getLogger(__name__)

# The single set of categories a reel can belong to (auto-assigned or user-picked).
ALLOWED_CATEGORIES = {
    "fitness", "cooking", "tech", "motivation", "education", "entertainment",
    "fashion", "travel", "business", "news", "health", "finance", "other",
}

# Bigger pool so a few slow extractions can't starve every other save. A hung
# yt-dlp thread can't be killed, so the real protection is keeping extraction
# fast/bounded (see extractor.py); this just widens the safety margin.
_executor = ThreadPoolExecutor(max_workers=8)
EXTRACT_TIMEOUT = 50      # hard ceiling for a single extraction (seconds)
CACHE_TTL_DAYS = 14       # re-extract if the cached entry is older than this

# Throttle cache pruning so we don't scan/delete on every save.
_PRUNE_INTERVAL = 3600    # seconds between prune attempts
_last_prune = 0.0

router = APIRouter(prefix="/api/reels", tags=["reels"])


@router.post("/save", response_model=ReelResponse, dependencies=[Depends(rate_limit(20, 60, "save"))])
def save_reel(body: ReelSaveRequest, db: Session = Depends(get_db)):
    _prune_cache_if_due(db)
    canonical_url = extractor.normalize_url(body.url)

    existing = db.query(ReelDB).filter(ReelDB.url == canonical_url).first()
    if existing:
        return _to_response(existing)

    # Cache-first: a prior successful extraction (even of a since-deleted reel)
    # is reused instantly, so re-saving never re-hits the source platform.
    info = _get_cached_extraction(db, canonical_url)
    if info is not None:
        logger.info(f"[SAVE] cache hit for {canonical_url}")
    else:
        try:
            future = _executor.submit(extractor.extract_info, canonical_url)
            info = future.result(timeout=EXTRACT_TIMEOUT)
        except FuturesTimeout:
            logger.error(f"[SAVE] Timed out extracting: {canonical_url}")
            raise HTTPException(status_code=422, detail="Extraction timed out. The platform may be slow or the URL is not accessible. Try again.")
        except Exception as e:
            logger.error(f"[SAVE] Extraction failed for {canonical_url}: {type(e).__name__}: {e}")
            raise HTTPException(status_code=422, detail=f"Could not extract content from URL: {str(e)}")

        if info.get("extracted"):
            _store_extraction(db, canonical_url, info)

    # Couldn't read any text or thumbnail. For a recognized platform (e.g. a
    # login-walled Facebook reel) save it as a link-only bookmark with a clean
    # label so the user keeps it and can add notes. Only reject unknown/garbage URLs.
    if not (info.get("best_text") or "").strip() and not info.get("thumbnail_url"):
        if info.get("platform") in (None, "", "unknown"):
            raise HTTPException(
                status_code=422,
                detail="Couldn't read anything from this link. Try a public YouTube Short, Instagram Reel, TikTok, LinkedIn or Facebook post.",
            )
        if _weak_title(info.get("title")):
            kind = "Reel" if "/reel" in canonical_url.lower() else "Post"
            info["title"] = f"{info['platform'].capitalize()} {kind}"

    duration = info.get("duration") or 0
    if duration > 600:
        mins = int(duration // 60)
        raise HTTPException(
            status_code=422,
            detail=f"This video is {mins} minutes long. SaveHere is for short-form content under 10 minutes (Reels, Shorts, TikToks)."
        )

    text = info["best_text"]

    # fall back to audio transcription only if captions and description both missing
    if info["needs_audio"]:
        audio_path = extractor.download_audio(body.url)
        if audio_path:
            transcribed = transcriber.transcribe(audio_path)
            if transcribed:
                text = transcribed

    # Skip AI entirely if there's nothing meaningful to summarize
    # (visual-only reels with on-screen text, no speech, no description)
    if len((text or "").strip()) < 50:
        logger.warning(f"[SAVE] No extractable text for {canonical_url} — saving without summary")
        ai = {"summary": [], "tags": [], "category": "other"}
    else:
        ai = summarizer.summarize(
            platform=info["platform"],
            title=info["title"],
            text=text,
        )

    # Use the AI-generated title only when the extracted one is weak (keeps good
    # YouTube/creator titles intact, fixes LinkedIn "Day352:-" style headlines).
    final_title = info["title"]
    if _weak_title(final_title) and ai.get("title"):
        final_title = ai["title"]

    reel = ReelDB(
        id=str(uuid.uuid4()),
        url=canonical_url,
        platform=info["platform"],
        title=final_title,
        thumbnail_url=info["thumbnail_url"],
        uploader=info["uploader"],
        duration=info["duration"],
        summary=ai["summary"],
        tags=ai["tags"],
        category=ai["category"],
        raw_text=text,
        created_at=datetime.utcnow(),
    )
    db.add(reel)
    db.commit()
    db.refresh(reel)
    return _to_response(reel)


@router.get("", response_model=ReelListResponse)
def list_reels(
    tag: str = None,
    category: str = None,
    platform: str = None,
    db: Session = Depends(get_db)
):
    query = db.query(ReelDB)

    if platform:
        query = query.filter(ReelDB.platform == platform)
    if category:
        query = query.filter(ReelDB.category == category)

    reels = query.order_by(ReelDB.created_at.desc()).all()

    if tag:
        reels = [r for r in reels if r.tags and tag.lower() in [t.lower() for t in r.tags]]

    return ReelListResponse(total=len(reels), items=[_to_response(r) for r in reels])


@router.get("/{reel_id}", response_model=ReelResponse)
def get_reel(reel_id: str, db: Session = Depends(get_db)):
    reel = db.query(ReelDB).filter(ReelDB.id == reel_id).first()
    if not reel:
        raise HTTPException(status_code=404, detail="Reel not found")
    return _to_response(reel)


RESUMMARIZE_LIMIT = 3


@router.post("/{reel_id}/resummarize", response_model=ReelResponse, dependencies=[Depends(rate_limit(10, 60, "resummarize"))])
def resummarize_reel(reel_id: str, db: Session = Depends(get_db)):
    reel = db.query(ReelDB).filter(ReelDB.id == reel_id).first()
    if not reel:
        raise HTTPException(status_code=404, detail="Reel not found")

    if reel.summarize_count >= RESUMMARIZE_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Re-summarize limit of {RESUMMARIZE_LIMIT} reached for this reel."
        )

    source_text = reel.raw_text or reel.notes
    if not source_text:
        raise HTTPException(
            status_code=422,
            detail="No content to summarize. Paste the post text into Notes first, then re-summarize."
        )

    ai = summarizer.summarize(
        platform=reel.platform,
        title=reel.title or "",
        text=source_text,
    )

    if not ai["summary"]:
        raise HTTPException(
            status_code=422,
            detail="Re-summarize found no meaningful content. The reel likely has no caption or transcript. Try adding your own notes instead."
        )

    reel.summary = ai["summary"]
    reel.tags = ai["tags"]
    reel.category = ai["category"]
    if _weak_title(reel.title) and ai.get("title"):
        reel.title = ai["title"]
    reel.summarize_count = (reel.summarize_count or 0) + 1
    db.commit()
    db.refresh(reel)
    return _to_response(reel)


@router.patch("/{reel_id}/category", response_model=ReelResponse)
def update_category(reel_id: str, body: ReelCategoryRequest, db: Session = Depends(get_db)):
    reel = db.query(ReelDB).filter(ReelDB.id == reel_id).first()
    if not reel:
        raise HTTPException(status_code=404, detail="Reel not found")
    cat = (body.category or "").strip().lower()
    if cat not in ALLOWED_CATEGORIES:
        raise HTTPException(status_code=422, detail="Invalid category.")
    reel.category = cat
    db.commit()
    db.refresh(reel)
    return _to_response(reel)


@router.patch("/{reel_id}/notes", response_model=ReelResponse)
def update_notes(reel_id: str, body: ReelNotesRequest, db: Session = Depends(get_db)):
    reel = db.query(ReelDB).filter(ReelDB.id == reel_id).first()
    if not reel:
        raise HTTPException(status_code=404, detail="Reel not found")
    reel.notes = body.notes
    db.commit()
    db.refresh(reel)
    return _to_response(reel)


@router.delete("/{reel_id}")
def delete_reel(reel_id: str, db: Session = Depends(get_db)):
    reel = db.query(ReelDB).filter(ReelDB.id == reel_id).first()
    if not reel:
        raise HTTPException(status_code=404, detail="Reel not found")
    db.delete(reel)
    db.commit()
    return {"message": "Deleted"}


def _weak_title(t: str | None) -> bool:
    """A title we'd rather replace with an AI-generated one (e.g. LinkedIn's
    'Day352:-' first-line headline, hashtag soup, or too short)."""
    if not t or len(t.strip()) < 6:
        return True
    s = t.strip()
    if re.match(r'^day\s*\d+', s, re.IGNORECASE):
        return True
    # generic platform placeholders like "Facebook Reel", "Instagram Post"
    if re.match(r'^(youtube|instagram|tiktok|linkedin|facebook|unknown|web)\s+(reel|post|video|short|link)s?$', s, re.IGNORECASE):
        return True
    # Instagram/TikTok generic auto-titles like "Video by someone", "Reel by someone"
    if re.match(r'^(video|reel|post|photo|clip)\s+by\b', s, re.IGNORECASE):
        return True
    if len(re.sub(r'[#@\W\d]+', '', s)) < 6:   # mostly hashtags/symbols
        return True
    return False


def _prune_cache_if_due(db: Session) -> None:
    """Best-effort: delete extraction-cache rows past the TTL. Throttled so it
    runs at most once per _PRUNE_INTERVAL, and never breaks a save if it fails."""
    global _last_prune
    now = time.monotonic()
    if now - _last_prune < _PRUNE_INTERVAL:
        return
    _last_prune = now
    try:
        cutoff = datetime.utcnow() - timedelta(days=CACHE_TTL_DAYS)
        deleted = (
            db.query(ExtractionCacheDB)
            .filter(ExtractionCacheDB.created_at < cutoff)
            .delete(synchronize_session=False)
        )
        db.commit()
        if deleted:
            logger.info(f"[CACHE] pruned {deleted} expired extraction(s)")
    except Exception as e:
        db.rollback()
        logger.warning(f"[CACHE] prune failed: {e}")


def _get_cached_extraction(db: Session, url: str) -> dict | None:
    """Return a fresh cached extraction as an info dict, or None. Fails open."""
    try:
        row = db.query(ExtractionCacheDB).filter(ExtractionCacheDB.url == url).first()
        if not row:
            return None
        if row.created_at and (datetime.utcnow() - row.created_at) > timedelta(days=CACHE_TTL_DAYS):
            return None  # stale — let it re-extract
        return {
            "title": row.title or "",
            "caption": row.caption or "",
            "transcript": row.transcript or "",
            "best_text": row.best_text or "",
            "thumbnail_url": row.thumbnail_url or "",
            "duration": row.duration or 0,
            "platform": row.platform,
            "uploader": row.uploader or "",
            "needs_audio": bool(row.needs_audio),
            "extracted": True,
        }
    except Exception as e:
        logger.warning(f"[CACHE] read failed for {url}: {e}")
        return None


def _store_extraction(db: Session, url: str, info: dict) -> None:
    """Upsert a successful extraction into the cache. Fails open."""
    try:
        row = db.query(ExtractionCacheDB).filter(ExtractionCacheDB.url == url).first()
        if row is None:
            row = ExtractionCacheDB(url=url)
            db.add(row)
        row.platform = info.get("platform") or "unknown"
        row.title = info.get("title")
        row.caption = info.get("caption")
        row.transcript = info.get("transcript")
        row.best_text = info.get("best_text")
        row.thumbnail_url = info.get("thumbnail_url")
        row.uploader = info.get("uploader")
        row.duration = info.get("duration") or 0
        row.needs_audio = bool(info.get("needs_audio"))
        row.created_at = datetime.utcnow()
        db.commit()
    except Exception as e:
        db.rollback()
        logger.warning(f"[CACHE] write failed for {url}: {e}")


def _to_response(reel: ReelDB) -> ReelResponse:
    return ReelResponse(
        id=reel.id,
        url=reel.url,
        platform=reel.platform,
        title=reel.title,
        thumbnail_url=reel.thumbnail_url,
        uploader=reel.uploader,
        duration=int(reel.duration) if reel.duration is not None else None,
        summary=reel.summary or [],
        tags=reel.tags or [],
        category=reel.category,
        notes=reel.notes,
        summarize_count=reel.summarize_count or 0,
        tasks_count=reel.tasks_count or 0,
        workout_count=reel.workout_count or 0,
        created_at=reel.created_at,
    )
