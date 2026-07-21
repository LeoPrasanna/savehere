"""Put the standing test accounts into fixed tiers so you can check each tier
by simply logging in as that user (owner-run, local dev only).

Why a script and not an in-app switcher: tier writes mint revenue entitlements —
`scripts/set_tier.py` deliberately keeps that off the network surface. This is
its batch companion for the dev test accounts.

Two mechanisms, because the tiers live in different places:
  - pro   -> Supabase JWT claim `app_metadata.tier="pro"` (same as set_tier.py).
             Takes effect only after that user signs OUT and back IN (the JWT
             caches the tier for up to 1h). No local profile needed — pro
             short-circuits the trial math.
  - trial -> local `profiles.trial_started_at = now`  (fresh 10-day trial).
  - free  -> local `profiles.trial_started_at = now - (TRIAL_DAYS + 5)` (over).
             trial/free are recomputed from the local SQLite DB on EVERY request,
             so they apply on the next API call — just refresh the app.

Pre-seeds the local profile row, so the account works at the right tier even if
it has never hit this backend yet. Also clears each account's AI counter so a
freshly-flipped tier isn't instantly over its (smaller) daily cap.

Guarded: only targets the savehere-dev project — DATABASE_URL must be local
SQLite or savehere-dev, AND SUPABASE_URL must be savehere-dev (the pro claim is
written to whatever Supabase project SUPABASE_URL names, so a prod URL here would
stamp a real user). Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env (to
resolve emails -> user ids and to write the pro claim).

Usage:
    python scripts/dev_seed_tiers.py                 # apply the DEFAULT_MAP below
    python scripts/dev_seed_tiers.py <email> <trial|free|pro>   # one-off
"""
import sys
from datetime import datetime, timedelta

import httpx

sys.path.insert(0, ".")

from app.config import settings  # noqa: E402

# The dev test accounts. NOTE the trial one is spelled "trail" (as created).
DEFAULT_MAP = {
    "trailtieruser@gmail.com": "trial",
    "freetieruser@gmail.com": "free",
    "protieruser@gmail.com": "pro",
}
VALID = ("trial", "free", "pro")


# Fail-closed dev guard. ponytail: dev ref hardcoded — add refs if a second
# dev/staging project appears.
_DEV_REF = "ymclmbmmwtczspnmccsy"  # savehere-dev


def _guard() -> None:
    db_ok = settings.DATABASE_URL.startswith("sqlite") or _DEV_REF in settings.DATABASE_URL
    supa_ok = _DEV_REF in settings.SUPABASE_URL
    if not (db_ok and supa_ok):
        sys.exit("Refusing to run: this dev tool only targets the savehere-dev project "
                 "(SUPABASE_URL must be savehere-dev; DATABASE_URL must be local SQLite or "
                 "savehere-dev). Never point it at production.")
    if not (settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY):
        sys.exit("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env")


def _admin_headers() -> dict:
    key = settings.SUPABASE_SERVICE_ROLE_KEY
    return {"apikey": key, "Authorization": f"Bearer {key}"}


def _resolve_emails() -> dict[str, str]:
    """email(lower) -> supabase user id, for every user in the project."""
    r = httpx.get(f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/admin/users",
                  headers=_admin_headers(), params={"page": 1, "per_page": 200}, timeout=15)
    r.raise_for_status()
    return {(u.get("email") or "").lower(): u["id"] for u in r.json().get("users", [])}


def _set_pro_claim(user_id: str) -> None:
    r = httpx.put(f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/admin/users/{user_id}",
                  headers=_admin_headers(), json={"app_metadata": {"tier": "pro"}}, timeout=15)
    r.raise_for_status()


def _apply_local_tier(user_id: str, tier: str) -> None:
    """Pre-seed the local profile clock for trial/free; clear pro's claim if it
    was previously set (so a re-used account really drops to trial/free)."""
    from app.database import SessionLocal, ProfileDB, AiActionLogDB, AiUsageDB
    from app.quota import _utc_today
    db = SessionLocal()
    try:
        if tier == "trial":
            started = datetime.utcnow()
        else:  # free
            started = datetime.utcnow() - timedelta(days=settings.TRIAL_DAYS + 5)
        p = db.query(ProfileDB).filter(ProfileDB.user_id == user_id).first()
        if p:
            p.trial_started_at = started
            p.trial_extra_days = 0
        else:
            db.add(ProfileDB(user_id=user_id, trial_started_at=started, trial_extra_days=0))
        # Start clean: clear today's AI counter + the descriptive log.
        db.query(AiUsageDB).filter(AiUsageDB.user_id == user_id, AiUsageDB.day == _utc_today()).delete()
        db.query(AiActionLogDB).filter(AiActionLogDB.user_id == user_id, AiActionLogDB.day == _utc_today()).delete()
        db.commit()
    finally:
        db.close()


def _apply(email: str, tier: str, ids: dict[str, str]) -> str:
    uid = ids.get(email.lower())
    if not uid:
        return f"  SKIP  {email:26} — not found in this Supabase project"
    if tier == "pro":
        _set_pro_claim(uid)
        return f"  OK    {email:26} -> pro   (Supabase claim; needs sign-out/in to take effect)"
    # trial / free: pro claim must be absent, and the local clock decides.
    _apply_local_tier(uid, tier)
    return f"  OK    {email:26} -> {tier:5} (local clock; applies on next request — just refresh)"


def main() -> None:
    _guard()
    args = sys.argv[1:]
    if len(args) == 2 and args[1] in VALID:
        mapping = {args[0]: args[1]}
    elif not args:
        mapping = DEFAULT_MAP
    else:
        sys.exit(__doc__)

    ids = _resolve_emails()
    print("Seeding tiers:")
    for email, tier in mapping.items():
        print(_apply(email, tier, ids))
    print("\nReminder: pro takes effect only after that user signs out and back in.\n"
          "trial/free apply on the next API call — just refresh the app.")


if __name__ == "__main__":
    main()
