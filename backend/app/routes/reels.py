from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, func, cast, String
import uuid
import re
import time
import logging
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout

from app.database import get_db, SessionLocal, ReelDB, ExtractionCacheDB, TaskDB, WorkoutExerciseDB
from app.models.reel import ReelSaveRequest, ReelNotesRequest, ReelCategoryRequest, ReelResponse, ReelListResponse
from app.services import extractor, transcriber, summarizer
from app.ratelimit import rate_limit
from app.quota import charge_ai_action
from app.auth import get_current_user, AuthUser

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
EXTRACT_TIMEOUT = 20      # hard ceiling for a single extraction (seconds) — keep the
                          # save snappy; a slower platform degrades to a link-only save.
CACHE_TTL_DAYS = 14       # re-extract if the cached entry is older than this

# Throttle cache pruning so we don't scan/delete on every save.
_PRUNE_INTERVAL = 3600    # seconds between prune attempts
_last_prune = 0.0

# Max orphaned summaries to re-enqueue on startup (see recover_pending_summaries).
PENDING_RECOVERY_LIMIT = 25

router = APIRouter(prefix="/api/reels", tags=["reels"])


def _get_owned_reel_or_404(reel_id: str, user: AuthUser, db: Session) -> ReelDB:
    """Fetch a reel the caller owns, else 404. A 404 (not 403) on someone else's
    reel avoids leaking that the id exists."""
    reel = (
        db.query(ReelDB)
        .filter(ReelDB.id == reel_id, ReelDB.user_id == user.id)
        .first()
    )
    if not reel:
        raise HTTPException(status_code=404, detail="Reel not found")
    return reel


@router.post("/save", response_model=ReelResponse, dependencies=[Depends(rate_limit(20, 60, "save"))])
def save_reel(body: ReelSaveRequest, background_tasks: BackgroundTasks,
              user: AuthUser = Depends(get_current_user), db: Session = Depends(get_db)):
    _prune_cache_if_due(db)
    canonical_url = extractor.normalize_url(body.url)

    # Dedup per-user: the same link saved by another user is a separate card.
    existing = (
        db.query(ReelDB)
        .filter(ReelDB.url == canonical_url, ReelDB.user_id == user.id)
        .first()
    )
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
            _platform = extractor.detect_platform(canonical_url)
            logger.error(f"[SAVE] timeout platform={_platform} url={canonical_url}")
            raise HTTPException(status_code=422, detail="Extraction timed out. The platform may be slow or the URL is not accessible. Try again.")
        except Exception as e:
            _platform = extractor.detect_platform(canonical_url)
            logger.error(f"[SAVE] failed platform={_platform} url={canonical_url}: {type(e).__name__}: {e}")
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

    # Persist the card immediately — NO AI call on the request path. The summary
    # (and the slow audio-transcription fallback) run in a background task so the
    # save returns as soon as metadata is extracted and the card appears instantly.
    raw_text = (info.get("best_text") or "").strip()
    should_summarize = len(raw_text) >= 50 or bool(info.get("needs_audio"))

    # The auto-summary is an AI action like any other — without this charge, saving
    # in a loop was unbounded Claude spend (the per-IP burst guard was the only cap).
    # Over budget → the card still saves instantly, marked 'failed' so the detail
    # screen offers a retry once the daily quota resets.
    quota_spent = False
    if should_summarize:
        try:
            charge_ai_action(db, user)
        except HTTPException as e:
            if e.status_code != status.HTTP_429_TOO_MANY_REQUESTS:
                raise
            quota_spent = True
            should_summarize = False
            logger.info(f"[SAVE] AI quota spent for user {user.id} — saving without summary")

    reel = ReelDB(
        id=str(uuid.uuid4()),
        user_id=user.id,
        url=canonical_url,
        platform=info["platform"],
        title=info["title"],
        thumbnail_url=info["thumbnail_url"],
        uploader=info["uploader"],
        duration=info["duration"],
        summary=[],
        tags=[],
        category="other",
        raw_text=raw_text,
        summary_status="pending" if should_summarize else ("failed" if quota_spent else "skipped"),
        created_at=datetime.utcnow(),
    )
    db.add(reel)
    db.commit()
    db.refresh(reel)

    logger.info(f"[SAVE] success platform={reel.platform} id={reel.id}")
    if should_summarize:
        background_tasks.add_task(_summarize_reel, reel.id)

    return _to_response(reel)


@router.get("", response_model=ReelListResponse)
def list_reels(
    tag: str = None,
    category: str = None,
    platform: str = None,
    limit: int = 1000,
    offset: int = 0,
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """`total` is the full count for the active filter; `items` is the requested
    page. Clients paginate with limit/offset and stop when offset+len >= total.
    Default limit is high so callers that just want counts (Landing) still work."""
    limit = max(1, min(limit, 1000))
    offset = max(0, offset)

    query = db.query(ReelDB).filter(ReelDB.user_id == user.id)
    if platform:
        query = query.filter(ReelDB.platform == platform)
    if category:
        query = query.filter(ReelDB.category == category)

    if tag:
        # tags is a JSON array — SQLite can't index into it, so filter in Python
        # over the full set, then slice the page.
        rows = query.order_by(ReelDB.created_at.desc()).all()
        matched = [r for r in rows if r.tags and tag.lower() in [t.lower() for t in r.tags]]
        total = len(matched)
        page = matched[offset:offset + limit]
    else:
        total = query.count()
        page = query.order_by(ReelDB.created_at.desc()).offset(offset).limit(limit).all()

    return ReelListResponse(total=total, items=[_to_response(r) for r in page])


@router.get("/search", response_model=ReelListResponse)
def search_reels(q: str = "", limit: int = 24, offset: int = 0,
                 user: AuthUser = Depends(get_current_user), db: Session = Depends(get_db)):
    """Full-library search across title, notes, summary, and tags."""
    q = q.strip()
    if not q:
        return ReelListResponse(total=0, items=[])
    limit = max(1, min(limit, 100))
    offset = max(0, offset)
    term = f"%{q.lower()}%"
    query = db.query(ReelDB).filter(
        ReelDB.user_id == user.id,
        or_(
            func.lower(ReelDB.title).like(term),
            func.lower(ReelDB.notes).like(term),
            func.lower(cast(ReelDB.summary, String)).like(term),
            func.lower(cast(ReelDB.tags, String)).like(term),
        )
    ).order_by(ReelDB.created_at.desc())
    total = query.count()
    page = query.offset(offset).limit(limit).all()
    return ReelListResponse(total=total, items=[_to_response(r) for r in page])


@router.get("/{reel_id}", response_model=ReelResponse)
def get_reel(reel_id: str, user: AuthUser = Depends(get_current_user), db: Session = Depends(get_db)):
    reel = _get_owned_reel_or_404(reel_id, user, db)
    return _to_response(reel)


RESUMMARIZE_LIMIT = 3


@router.post("/{reel_id}/resummarize", response_model=ReelResponse, dependencies=[Depends(rate_limit(10, 60, "resummarize"))])
def resummarize_reel(reel_id: str, user: AuthUser = Depends(get_current_user), db: Session = Depends(get_db)):
    reel = _get_owned_reel_or_404(reel_id, user, db)

    if reel.summarize_count >= RESUMMARIZE_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Re-summarize limit of {RESUMMARIZE_LIMIT} reached for this reel."
        )

    # Combine the extracted text with the user's notes so notes they deliberately
    # add always shape the re-summary — raw_text alone used to shadow them entirely,
    # so adding notes to a reel that already had some caption did nothing.
    source_text = "\n\n".join(
        p.strip() for p in (reel.raw_text, reel.notes) if p and p.strip()
    )
    if not source_text:
        raise HTTPException(
            status_code=422,
            detail="No content to summarize. Paste the post text into Notes first, then re-summarize."
        )

    # Per-user daily AI budget (shared across all AI actions). Charged before the call.
    charge_ai_action(db, user)

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


@router.post("/{reel_id}/summarize", response_model=ReelResponse, dependencies=[Depends(rate_limit(10, 60, "summarize"))])
def summarize_now(reel_id: str, user: AuthUser = Depends(get_current_user), db: Session = Depends(get_db)):
    """Run (or retry) the background summary synchronously for one reel. Used by the
    detail screen to retry a 'failed'/'pending' summary or to summarize on demand.
    A reel already summarized is returned untouched (use resummarize to redo it)."""
    reel = _get_owned_reel_or_404(reel_id, user, db)
    if reel.summary_status == "ready" and reel.summary:
        return _to_response(reel)

    # 'skipped' means a prior run already found nothing readable (and the audio
    # fallback failed) — retrying would charge the user's budget for a guaranteed
    # skip. Point them at notes + re-summarize instead.
    if reel.summary_status == "skipped" and len((reel.raw_text or "").strip()) < 50:
        raise HTTPException(
            status_code=422,
            detail="There's nothing readable in this reel to summarize. Paste the post text into Notes, then use re-summarize.",
        )

    # Per-user daily AI budget — only charged when we actually run the summary (a
    # reel already 'ready' returned above without spending a unit).
    charge_ai_action(db, user)

    _summarize_reel(reel.id)        # own session; commits the result
    db.refresh(reel)                # pull the freshly-committed row into this session
    return _to_response(reel)


@router.patch("/{reel_id}/category", response_model=ReelResponse)
def update_category(reel_id: str, body: ReelCategoryRequest,
                    user: AuthUser = Depends(get_current_user), db: Session = Depends(get_db)):
    reel = _get_owned_reel_or_404(reel_id, user, db)
    cat = (body.category or "").strip().lower()
    if cat not in ALLOWED_CATEGORIES:
        raise HTTPException(status_code=422, detail="Invalid category.")
    reel.category = cat
    db.commit()
    db.refresh(reel)
    return _to_response(reel)


@router.patch("/{reel_id}/notes", response_model=ReelResponse)
def update_notes(reel_id: str, body: ReelNotesRequest,
                 user: AuthUser = Depends(get_current_user), db: Session = Depends(get_db)):
    reel = _get_owned_reel_or_404(reel_id, user, db)
    reel.notes = body.notes
    db.commit()
    db.refresh(reel)
    return _to_response(reel)


@router.delete("/{reel_id}")
def delete_reel(reel_id: str, user: AuthUser = Depends(get_current_user), db: Session = Depends(get_db)):
    reel = _get_owned_reel_or_404(reel_id, user, db)
    # Children are removed explicitly — SQLite only honors ON DELETE CASCADE with
    # PRAGMA foreign_keys on, and rows saved before that fix may be orphaned.
    db.query(TaskDB).filter(TaskDB.reel_id == reel.id).delete(synchronize_session=False)
    db.query(WorkoutExerciseDB).filter(WorkoutExerciseDB.reel_id == reel.id).delete(synchronize_session=False)
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
        summary_status=getattr(reel, "summary_status", None) or "ready",
        notes=reel.notes,
        summarize_count=reel.summarize_count or 0,
        tasks_count=reel.tasks_count or 0,
        workout_count=reel.workout_count or 0,
        created_at=reel.created_at,
    )


def _summarize_reel(reel_id: str) -> None:
    """Background worker: turn a saved reel's raw_text (or audio) into a summary,
    tags and category. Runs off the request path so saving feels instant. Opens
    its own DB session (the request's session is already closed). Fail-safe: any
    error leaves the reel in 'failed' so the UI can offer a retry."""
    db = SessionLocal()
    try:
        reel = db.query(ReelDB).filter(ReelDB.id == reel_id).first()
        if not reel:
            return

        text = (reel.raw_text or "").strip()

        # Audio transcription fallback — the slow path, now off the request.
        if len(text) < 50:
            try:
                audio_path = extractor.download_audio(reel.url)
                if audio_path:
                    transcribed = (transcriber.transcribe(audio_path) or "").strip()
                    if transcribed:
                        text = transcribed
                        reel.raw_text = text
            except Exception as e:
                logger.warning(f"[SUMMARIZE] audio fallback failed for {reel_id}: {e}")

        if len(text) < 50:
            reel.summary, reel.tags = [], []
            reel.summary_status = "skipped"
            db.commit()
            logger.info(f"[SUMMARIZE] {reel_id} skipped — no extractable text")
            return

        ai = summarizer.summarize(platform=reel.platform, title=reel.title or "", text=text)
        reel.summary = ai["summary"]
        reel.tags = ai["tags"]
        if ai.get("category"):
            reel.category = ai["category"]
        # Replace a weak extracted title with the AI one (LinkedIn "Day352:-" etc.).
        if _weak_title(reel.title) and ai.get("title"):
            reel.title = ai["title"]
        reel.summary_status = "ready" if ai["summary"] else "skipped"
        db.commit()
        logger.info(f"[SUMMARIZE] {reel_id} done — status={reel.summary_status}")
    except Exception as e:
        logger.error(f"[SUMMARIZE] failed for {reel_id}: {type(e).__name__}: {e}")
        try:
            db.rollback()
            reel = db.query(ReelDB).filter(ReelDB.id == reel_id).first()
            if reel:
                reel.summary_status = "failed"
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


def recover_pending_summaries() -> None:
    """Re-enqueue summaries left in 'pending' by a previous process that died
    mid-task. FastAPI BackgroundTasks run in-process, so a restart/crash/cold-start
    (common on free hosting) orphans any in-flight summary — without this it would
    be stuck 'Summarizing…' forever. Called once on startup. Bounded so a backlog
    can't trigger a cost spike; anything beyond the cap is left for manual retry."""
    db = SessionLocal()
    try:
        rows = (
            db.query(ReelDB.id)
            .filter(ReelDB.summary_status == "pending")
            .order_by(ReelDB.created_at.desc())
            .limit(PENDING_RECOVERY_LIMIT)
            .all()
        )
        ids = [r[0] for r in rows]
    except Exception as e:
        logger.warning(f"[RECOVER] could not query pending summaries: {e}")
        return
    finally:
        db.close()

    for rid in ids:
        _executor.submit(_summarize_reel, rid)
    if ids:
        logger.info(f"[RECOVER] re-enqueued {len(ids)} orphaned pending summary task(s)")
