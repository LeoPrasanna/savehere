"""RevenueCat webhook → stamp `app_metadata.tier` in Supabase.

⚠️ SKETCH — not wired into `main.py` yet. This endpoint MINTS revenue
entitlements, so review + configure secrets before registering it.

What this replaces
------------------
`scripts/set_tier.py` (owner-run, manual) does the exact Supabase admin write
this endpoint automates. Same PUT, same service-role key — the only new parts
are (1) authenticating the caller (RevenueCat, not a logged-in user) and
(2) mapping RevenueCat's event types to `pro` / `free`.

Wiring preconditions (all required before this works)
-----------------------------------------------------
1. **Mobile app must set RevenueCat's `appUserID` to the Supabase user id.**
   The webhook's `event.app_user_id` is how we know WHOSE tier to change. If the
   app lets RevenueCat generate an anonymous id, we can't map the purchase back
   to a Supabase user. Configure this at login (Purchases.logIn(supabaseUserId)).
2. **Env vars:** `REVENUECAT_WEBHOOK_TOKEN` (shared secret you set in the
   RevenueCat dashboard's webhook "Authorization header value"), plus the
   existing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
3. **Register the router** in `app/main.py`:
       from app.routes.billing import router as billing_router
       app.include_router(billing_router)
4. In RevenueCat: Integrations → Webhooks → point at
   `https://<your-backend>/api/billing/revenuecat`, set the Authorization value
   to the same secret as `REVENUECAT_WEBHOOK_TOKEN`.

Tier takes effect on the user's next token refresh (<=1h) or re-login, exactly
like `set_tier.py` — the JWT `app_metadata.tier` claim is what `entitlements.py`
reads (see `tier_for`).
"""
import hmac
import logging

import httpx
from fastapi import APIRouter, Header, HTTPException, Request

from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/billing", tags=["billing"])

# RevenueCat event types, grouped by what they mean for entitlement.
#   GRANT   → user is (or just became) entitled → tier = pro
#   REVOKE  → entitlement actually ended         → tier = free
#   IGNORE  → auto-renew toggled / billing grace / transfers: entitlement
#             UNCHANGED, so touching the tier here would be wrong
#             (e.g. CANCELLATION only means auto-renew is off — they keep pro
#             until EXPIRATION).
_GRANT = {
    "INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION",
    "NON_RENEWING_PURCHASE", "PRODUCT_CHANGE", "SUBSCRIPTION_EXTENDED",
}
_REVOKE = {"EXPIRATION"}


def _set_tier(user_id: str, tier: str) -> None:
    """Write `app_metadata.tier` via the Supabase admin API (same call as
    scripts/set_tier.py). Idempotent — writing pro twice is a no-op, which is
    exactly what we want since RevenueCat retries webhooks."""
    if not (settings.SUPABASE_URL and settings.SUPABASE_SERVICE_ROLE_KEY):
        raise HTTPException(500, "Supabase admin credentials not configured")
    key = settings.SUPABASE_SERVICE_ROLE_KEY
    r = httpx.put(
        f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/admin/users/{user_id}",
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
        json={"app_metadata": {"tier": tier}},
        timeout=15,
    )
    r.raise_for_status()


@router.post("/revenuecat")
async def revenuecat_webhook(request: Request, authorization: str = Header(default="")):
    """Receive a RevenueCat webhook and flip the user's tier.

    Auth is a shared secret: RevenueCat sends whatever you configure as the
    webhook's Authorization header value; we compare it (constant-time) to
    settings.REVENUECAT_WEBHOOK_TOKEN. An unset token is fail-closed (every call
    is rejected). Anything mismatched -> 401 (never touch a tier)."""
    token = settings.REVENUECAT_WEBHOOK_TOKEN
    if not token or not hmac.compare_digest(authorization, token):
        raise HTTPException(status_code=401, detail="Unauthorized")

    body = await request.json()
    event = body.get("event") or {}
    event_type = event.get("type")
    user_id = event.get("app_user_id")

    # An anonymous / missing app_user_id means the mobile app didn't call
    # Purchases.logIn(supabaseUserId). Accept the webhook (200 so RevenueCat
    # stops retrying) but log loudly — this is a wiring bug, not a runtime error.
    if not user_id or user_id.startswith("$RCAnonymousID:"):
        logger.warning("[BILLING] webhook %s with unmapped app_user_id=%r — "
                       "app must set RevenueCat appUserID to the Supabase id",
                       event_type, user_id)
        return {"status": "ignored", "reason": "unmapped_user"}

    if event_type in _GRANT:
        _set_tier(user_id, "pro")
        logger.info("[BILLING] %s → tier=pro for %s", event_type, user_id)
    elif event_type in _REVOKE:
        _set_tier(user_id, "free")
        logger.info("[BILLING] %s → tier=free for %s", event_type, user_id)
    else:
        # CANCELLATION, BILLING_ISSUE, TRANSFER, TEST, etc. — entitlement
        # unchanged; acknowledge without a tier write.
        logger.info("[BILLING] %s → no tier change for %s", event_type, user_id)

    return {"status": "ok"}
