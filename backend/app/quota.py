"""
Per-user daily AI quota (DB-backed).

Every user-triggered Claude call — ask, recipe/tasks, workout, (re)summarize —
draws from one daily budget keyed on the Supabase user id. Unlike the per-IP rate
limiter (in-memory, resets on restart, bypassable by rotating IPs), this persists
in the DB, so it survives redeploys and bounds spend per *authenticated* user. It's
the real cost ceiling and the lever paid tiers hook into.

Routes call `charge_ai_action(db, user)`; it resolves the user's tier limit and
charges one action. The charge is a single atomic conditional UPDATE
(`... WHERE count < limit`), so concurrent requests can't overshoot the cap — it's
race-safe on SQLite (db-level write lock) and Postgres (row lock), single- or
multi-instance. Charged BEFORE the AI call: a failed generation still cost tokens.
"""
from datetime import datetime, date

from fastapi import HTTPException, status
from sqlalchemy import text, update, select
from sqlalchemy.orm import Session

from app.config import settings
from app.auth import AuthUser
from app.database import AiUsageDB
from app.entitlements import entitlements_for, tier_for  # noqa: F401  (tier_for re-exported for compat)

# Idempotent "make sure today's row exists" — DO NOTHING on a concurrent insert.
# The ON CONFLICT (column-list) syntax is identical on SQLite and Postgres.
_ENSURE_ROW = text(
    "INSERT INTO ai_usage (user_id, day, count) VALUES (:user_id, :day, 0) "
    "ON CONFLICT (user_id, day) DO NOTHING"
)


def _utc_today() -> date:
    return datetime.utcnow().date()


def daily_limit_for(user: AuthUser) -> int:
    """Paid-tier daily AI limit from the JWT alone — no trial math. Use
    `entitlements_for` for the user's EFFECTIVE limit; kept for tests/compat."""
    return settings.AI_PRO_DAILY_LIMIT if tier_for(user) == "pro" else settings.AI_DAILY_LIMIT


def usage_today(db: Session, user_id: str, *, today: date | None = None) -> int:
    """How many AI actions the user has spent today. Read-only — never charges."""
    day = today or _utc_today()
    count = db.execute(
        select(AiUsageDB.count).where(AiUsageDB.user_id == user_id, AiUsageDB.day == day)
    ).scalar_one_or_none()
    return count or 0


def charge_ai_action(db: Session, user: AuthUser, *, today: date | None = None) -> int:
    """Charge one AI action against the user's daily budget for their EFFECTIVE
    tier (pro / in-trial / post-trial trickle — see app/entitlements.py).

    Raises HTTP 429 when the day's allowance is exhausted. Call it AFTER any free
    validation/cap checks and BEFORE the Claude call."""
    ent = entitlements_for(user, db)
    return enforce_daily_ai_quota(db, user.id, ent.ai_daily_limit, today=today)


def enforce_daily_ai_quota(
    db: Session,
    user_id: str,
    limit: int | None = None,
    *,
    today: date | None = None,
) -> int:
    """Atomically charge one AI action against today's budget for `user_id`.

    Raises HTTP 429 when the day's allowance is exhausted (nothing is charged in
    that case). Returns the new running count on success. `limit` defaults to the
    free-tier `AI_DAILY_LIMIT`; `today` is injectable for tests.

    The increment is a single conditional UPDATE guarded by `count < limit`, so it
    can't overshoot under concurrency (a `limit` of 0 blocks even the first action).
    """
    if limit is None:
        limit = settings.AI_DAILY_LIMIT
    day = today or _utc_today()

    # 1. Ensure today's counter row exists (idempotent, race-safe).
    db.execute(_ENSURE_ROW, {"user_id": user_id, "day": day})

    # 2. Atomic conditional increment — only succeeds while under the limit.
    result = db.execute(
        update(AiUsageDB)
        .where(
            AiUsageDB.user_id == user_id,
            AiUsageDB.day == day,
            AiUsageDB.count < limit,
        )
        .values(count=AiUsageDB.count + 1)
    )
    db.commit()

    if result.rowcount == 0:
        # Row exists but count >= limit → today's budget is spent.
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"You've reached today's limit of {limit} AI actions "
                "(summaries, recipes, workouts and questions all count). "
                "It resets tomorrow — your saved library is still here to browse and search."
            ),
        )

    return db.execute(
        select(AiUsageDB.count).where(AiUsageDB.user_id == user_id, AiUsageDB.day == day)
    ).scalar_one()
