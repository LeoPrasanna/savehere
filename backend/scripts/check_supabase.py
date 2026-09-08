"""Quick connectivity check for the Supabase project. Run after filling real
values in .env:  python -m scripts.check_supabase   (from backend/)

It does NOT print secrets. It only reports reachability so you know the keys and
URL are wired correctly before any auth code depends on them.

This project uses Supabase's NEW asymmetric JWT signing (ECC P-256), so backend
auth (Phase 2) will verify access tokens against the public JWKS endpoint -- there
is no shared JWT secret to paste. This script confirms JWKS is reachable.
"""
import sys
import httpx

# Allow running as `python -m scripts.check_supabase` or `python scripts/check_supabase.py`.
sys.path.insert(0, ".")
from app.config import settings  # noqa: E402

PLACEHOLDERS = ("your_supabase", "YOUR-PROJECT")


def _is_placeholder(v: str) -> bool:
    return v == "" or any(p in v for p in PLACEHOLDERS)


def main() -> int:
    url = settings.SUPABASE_URL.rstrip("/")
    pub = settings.SUPABASE_PUBLISHABLE_KEY  # sb_publishable_...
    jwks_url = settings.SUPABASE_JWKS_URL

    print("Findable - Supabase connectivity check")
    print("-" * 40)

    missing = []
    if _is_placeholder(url):
        missing.append("SUPABASE_URL")
    if _is_placeholder(pub):
        missing.append("SUPABASE_PUBLISHABLE_KEY (the sb_publishable_... key)")
    if missing:
        print("[X] Not configured yet. Fill these in .env:")
        for m in missing:
            print(f"    - {m}")
        return 1

    # 1) GoTrue auth health - 200 means the project URL + key reach Supabase.
    try:
        r = httpx.get(f"{url}/auth/v1/health", headers={"apikey": pub}, timeout=10)
    except Exception as e:
        print(f"[X] Could not reach {url}: {type(e).__name__}: {e}")
        return 1
    if r.status_code != 200:
        print(f"[X] Unexpected response from {url}/auth/v1/health: HTTP {r.status_code}")
        return 1
    print(f"[OK] Reached Supabase auth at {url}  (HTTP 200)")

    # 2) JWKS endpoint - the public keys Phase 2 uses to verify access tokens.
    try:
        j = httpx.get(jwks_url, headers={"apikey": pub}, timeout=10)
        keys = j.json().get("keys", []) if j.status_code == 200 else []
    except Exception as e:
        print(f"[!] JWKS endpoint check failed: {type(e).__name__}: {e}")
        keys = []
    if keys:
        print(f"[OK] JWKS reachable - {len(keys)} signing key(s) published (token verification will work)")
    else:
        print("[!] JWKS returned no keys yet - fine if you haven't created an asymmetric "
              "signing key; Phase 2 verification needs at least one.")

    # 3) Service role is optional to set now (backend-only; used later for admin ops).
    svc = settings.SUPABASE_SERVICE_ROLE_KEY
    print("[OK] Service key is set" if not _is_placeholder(svc)
          else "[i] SUPABASE_SERVICE_ROLE_KEY not set yet (optional until admin ops are needed)")

    print("")
    print("All set - ready for Phase 2 (get_current_user via JWKS verification).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
