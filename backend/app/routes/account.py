from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import select
import httpx
import logging
from datetime import datetime, timedelta

from app.config import settings
from app.database import get_db, ReelDB, TaskDB, WorkoutExerciseDB, ProfileDB
from app.auth import get_current_user, AuthUser
from app.quota import usage_today
from app.entitlements import entitlements_for

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/account", tags=["account"])


def _delete_auth_user(user_id: str) -> bool:
    """Delete the Supabase Auth user via the Admin API (service-role key).

    Required for true account deletion (Apple guideline 5.1.1(v)) — without it
    the user could sign right back in after 'deleting' their account. Returns
    False (never raises) when unconfigured or the call fails; the caller
    reports that honestly instead of pretending."""
    if not (settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY):
        logger.warning("[ACCOUNT] auth deletion skipped — Supabase admin credentials not configured")
        return False
    try:
        r = httpx.delete(
            f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/admin/users/{user_id}",
            headers={
                "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
                "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
            },
            timeout=10,
        )
        if r.status_code in (200, 204):
            return True
        # 404 = already gone (e.g. retry after a partial failure) — that's done.
        if r.status_code == 404:
            return True
        logger.error(f"[ACCOUNT] auth deletion failed for {user_id}: HTTP {r.status_code}")
        return False
    except Exception as e:
        logger.error(f"[ACCOUNT] auth deletion errored for {user_id}: {type(e).__name__}: {e}")
        return False


@router.get("/usage")
def get_usage(user: AuthUser = Depends(get_current_user), db: Session = Depends(get_db)):
    """The caller's effective tier and today's usage — read-only, never charges.
    Lets the app show honest meters (AI budget, trial countdown, save cap)
    instead of surprising users with a 429/403."""
    ent = entitlements_for(user, db)
    used = usage_today(db, user.id)
    saves_used = db.query(ReelDB).filter(ReelDB.user_id == user.id).count()
    tomorrow = datetime.utcnow().date() + timedelta(days=1)
    return {
        # Effective tier: 'pro' | 'trial' | 'free' (trial expired).
        "tier": ent.tier,
        "trial_ends_at": ent.trial_ends_at.isoformat() + "Z" if ent.trial_ends_at else None,
        "saves": {"used": saves_used, "limit": ent.save_limit},   # limit null = unlimited
        # Legacy top-level AI fields (older clients read these directly).
        "used": used,
        "limit": ent.ai_daily_limit,
        "remaining": max(0, ent.ai_daily_limit - used),
        "resets_at": f"{tomorrow.isoformat()}T00:00:00Z",  # quota days are UTC
    }


# Registered on both "" and "/" so DELETE /api/account works without a 307
# redirect (some HTTP clients drop the Authorization header on redirects).
@router.delete("")
@router.delete("/", include_in_schema=False)
def delete_account(user: AuthUser = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete all data associated with the authenticated user: reels, their
    tasks and workout exercises, and personal notes. Children are deleted
    explicitly (not left to FK cascade) so this also sweeps any orphans and
    behaves identically on SQLite and Postgres. `ai_usage` rows are kept —
    deleting them would let a user reset their daily AI quota by wiping data.
    The Supabase Auth user record is managed separately via the client SDK."""

    user_id = user.id
    reel_ids = select(ReelDB.id).where(ReelDB.user_id == user_id)

    tasks_removed = (
        db.query(TaskDB)
        .filter(TaskDB.reel_id.in_(reel_ids))
        .delete(synchronize_session=False)
    )
    exercises_removed = (
        db.query(WorkoutExerciseDB)
        .filter(WorkoutExerciseDB.reel_id.in_(reel_ids))
        .delete(synchronize_session=False)
    )
    reel_count = (
        db.query(ReelDB)
        .filter(ReelDB.user_id == user_id)
        .delete(synchronize_session=False)
    )
    # Profile (trial clock) goes with the account. trial_grants stays: it holds
    # only a hash of the normalized email and exists precisely so that deleting
    # the account can't mint a fresh trial (fraud-prevention, no readable PII).
    db.query(ProfileDB).filter(ProfileDB.user_id == user_id).delete(synchronize_session=False)
    # extraction_cache is shared (keyed by URL, no user data) — untouched.
    db.commit()

    # Data is gone — now remove the Supabase Auth record so the account truly
    # ceases to exist (otherwise the user can sign right back in).
    auth_deleted = _delete_auth_user(user_id)

    logger.info(
        f"Account deleted for user {user_id}: {reel_count} reels, "
        f"{tasks_removed} tasks, {exercises_removed} exercises removed, "
        f"auth_deleted={auth_deleted}"
    )

    return {
        "deleted": True,
        "auth_deleted": auth_deleted,
        "reels_removed": reel_count,
        "message": (
            "Your account and all saved data have been deleted."
            if auth_deleted
            else "All your saved data has been deleted, but the sign-in record "
                 "couldn't be removed — contact support to finish closing the account."
        ),
    }
