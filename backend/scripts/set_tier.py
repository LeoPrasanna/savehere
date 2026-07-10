"""Stamp a user's paid tier into Supabase `app_metadata` (owner-run, local).

This is deliberately a SCRIPT and not an API endpoint: tier writes are the one
operation that mints revenue entitlements, and a forgotten "temporary admin
endpoint" is a standing self-upgrade hole. The RevenueCat webhook replaces this
at launch; until then, run:

    python scripts/set_tier.py user@example.com pro
    python scripts/set_tier.py 8f14e5-...-uuid free

Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env.
Note: the user's app sees the new tier after their next token refresh (<=1 h),
or immediately after they sign out and back in.
"""
import sys
import httpx

sys.path.insert(0, ".")
from app.config import settings  # noqa: E402

VALID_TIERS = ("free", "pro")


def _headers() -> dict:
    key = settings.SUPABASE_SERVICE_ROLE_KEY
    return {"apikey": key, "Authorization": f"Bearer {key}"}


def _find_user_id(identifier: str) -> str:
    """Accept a user UUID directly, or resolve an email via the admin API."""
    if "@" not in identifier:
        return identifier
    r = httpx.get(
        f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/admin/users",
        headers=_headers(),
        params={"page": 1, "per_page": 200},
        timeout=15,
    )
    r.raise_for_status()
    users = r.json().get("users", [])
    matches = [u for u in users if (u.get("email") or "").lower() == identifier.lower()]
    if not matches:
        sys.exit(f"No user found with email {identifier} (first 200 users searched).")
    return matches[0]["id"]


def main() -> None:
    if len(sys.argv) != 3 or sys.argv[2] not in VALID_TIERS:
        sys.exit(f"Usage: python scripts/set_tier.py <email-or-user-id> <{'|'.join(VALID_TIERS)}>")
    if not (settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY):
        sys.exit("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from backend/.env")

    identifier, tier = sys.argv[1], sys.argv[2]
    user_id = _find_user_id(identifier)

    r = httpx.put(
        f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/admin/users/{user_id}",
        headers=_headers(),
        json={"app_metadata": {"tier": tier}},
        timeout=15,
    )
    r.raise_for_status()
    got = (r.json().get("app_metadata") or {}).get("tier")
    if got != tier:
        sys.exit(f"Write did not stick (server says tier={got!r}). Check the service-role key.")
    print(f"OK: {identifier} ({user_id}) -> tier={tier}. "
          f"Takes effect on their next token refresh (<=1 h) or re-login.")


if __name__ == "__main__":
    main()
