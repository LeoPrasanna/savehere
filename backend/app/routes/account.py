from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import select
import logging
from datetime import datetime, timedelta

from app.database import get_db, ReelDB, TaskDB, WorkoutExerciseDB
from app.auth import get_current_user, AuthUser
from app.quota import tier_for, daily_limit_for, usage_today

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/account", tags=["account"])


@router.get("/usage")
def get_usage(user: AuthUser = Depends(get_current_user), db: Session = Depends(get_db)):
    """The caller's tier and today's AI-action usage — read-only, never charges.
    Lets the app show an honest meter instead of surprising users with a 429."""
    used = usage_today(db, user.id)
    limit = daily_limit_for(user)
    tomorrow = datetime.utcnow().date() + timedelta(days=1)
    return {
        "tier": tier_for(user),
        "used": used,
        "limit": limit,
        "remaining": max(0, limit - used),
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
    # extraction_cache is shared (keyed by URL, no user data) — untouched.
    db.commit()

    logger.info(
        f"Account data deleted for user {user_id}: {reel_count} reels, "
        f"{tasks_removed} tasks, {exercises_removed} exercises removed"
    )

    return {
        "deleted": True,
        "reels_removed": reel_count,
        "message": "All your saved data has been deleted. You will be signed out.",
    }
