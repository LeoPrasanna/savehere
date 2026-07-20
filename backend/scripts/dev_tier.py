"""LOCAL-ONLY tier switch for testing trial <-> free (owner-run, dev machine).

Why this exists: the effective tier is computed server-side from the trial clock
in `profiles`, so the only way to see the post-trial FREE experience (Pro locks,
3 AI/day, 20-save cap) is to move that clock. Waiting 10 days is not a test plan.

    python scripts/dev_tier.py status                # every local user + tier
    python scripts/dev_tier.py expire <user-id>      # -> free (trial ended)
    python scripts/dev_tier.py trial  <user-id>      # -> trial (restart clock)
    python scripts/dev_tier.py resetquota <user-id>  # clear today's AI usage

`resetquota` matters when you drop an account to free: the free cap is 3/day,
so an account that already spent (say) 13 actions today under the trial cap is
instantly over budget and every AI call 429s — which looks like a bug but isn't.
Clear the day's counter and the free tier behaves the way a real free user's
would.

PRO is NOT settable here. It lives in the Supabase JWT claim
(`app_metadata.tier`), not this database — use `scripts/set_tier.py <email> pro`
for that, then sign out and back in (the JWT caches the tier for up to 1h).
By contrast trial/free is recomputed from the DB on every request, so changes
made here take effect on the very next API call — just refresh the app.

Guard: refuses to run unless DATABASE_URL is SQLite, so this can never be
pointed at a production Postgres.
"""
import sys
from datetime import datetime, timedelta

sys.path.insert(0, ".")

from app.config import settings  # noqa: E402

if not settings.DATABASE_URL.startswith("sqlite"):
    sys.exit(f"Refusing to run: DATABASE_URL is not SQLite ({settings.DATABASE_URL.split('://')[0]}://…). "
             "This is a local dev tool only.")

from app.database import SessionLocal, ProfileDB, ReelDB, AiUsageDB  # noqa: E402
from app.auth import AuthUser  # noqa: E402
from app.entitlements import entitlements_for  # noqa: E402


def _status(db) -> None:
    profiles = db.query(ProfileDB).all()
    if not profiles:
        print("No profiles yet — sign in on the app once to create one.")
        return
    print(f"{'user_id':38}  {'tier':6}  {'trial ends':20}  reels  ai/day")
    for p in profiles:
        # Use the real entitlement math (never duplicate it). No JWT claims here,
        # so a genuinely-pro user still shows as trial/free — pro lives in Supabase.
        ent = entitlements_for(AuthUser(id=p.user_id, email=None), db)
        reels = db.query(ReelDB).filter(ReelDB.user_id == p.user_id).count()
        ends = ent.trial_ends_at.strftime("%Y-%m-%d %H:%M") if ent.trial_ends_at else "-"
        print(f"{p.user_id:38}  {ent.tier:6}  {ends:20}  {reels:5}  {ent.ai_daily_limit}")
    print("\n(pro is not visible here — it's a Supabase JWT claim, see scripts/set_tier.py)")


def _set(db, user_id: str, *, expire: bool) -> None:
    p = db.query(ProfileDB).filter(ProfileDB.user_id == user_id).first()
    if not p:
        sys.exit(f"No profile for {user_id}. Run `status` to list known users.")
    if expire:
        # Well past TRIAL_DAYS (+ any referral extra days) so the trial is over.
        p.trial_started_at = datetime.utcnow() - timedelta(days=settings.TRIAL_DAYS + (p.trial_extra_days or 0) + 5)
    else:
        p.trial_started_at = datetime.utcnow()
    db.commit()
    ent = entitlements_for(AuthUser(id=user_id, email=None), db)
    print(f"OK: {user_id} -> tier={ent.tier} (AI {ent.ai_daily_limit}/day, "
          f"save cap {ent.save_limit if ent.save_limit is not None else 'unlimited'})")
    print("Takes effect on the next API call — just refresh the app.")


def _reset_quota(db, user_id: str) -> None:
    """Clear today's AI counter (quota rows are keyed on the UTC day)."""
    from app.quota import _utc_today
    n = (db.query(AiUsageDB)
           .filter(AiUsageDB.user_id == user_id, AiUsageDB.day == _utc_today())
           .delete(synchronize_session=False))
    db.commit()
    print(f"OK: cleared today's AI usage for {user_id} ({n} row(s)).")


def main() -> None:
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    db = SessionLocal()
    try:
        if cmd == "status":
            _status(db)
        elif cmd in ("expire", "trial") and len(sys.argv) == 3:
            _set(db, sys.argv[2], expire=(cmd == "expire"))
        elif cmd == "resetquota" and len(sys.argv) == 3:
            _reset_quota(db, sys.argv[2])
        else:
            sys.exit(__doc__)
    finally:
        db.close()


if __name__ == "__main__":
    main()
