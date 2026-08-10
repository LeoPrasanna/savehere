from dotenv import load_dotenv
import os

load_dotenv(override=True)

class Settings:
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    APIFY_API_KEY: str = os.getenv("APIFY_API_KEY", "")
    # YouTube Data API v3 — the ONLY reliable way to read a Short's description
    # from a datacenter IP. yt-dlp and the watch-page scrape are bot-blocked on
    # Render (verified: title+thumbnail come back, description and transcript do
    # not), so without this every YouTube save degrades to a link-only bookmark.
    # Unset = the fallback is skipped and behaviour is exactly as before.
    YOUTUBE_API_KEY: str = os.getenv("YOUTUBE_API_KEY", "")
    # Optional outbound proxy for ALL extraction traffic (yt-dlp + httpx page and
    # caption fetches). Empty by default, which is a true no-op: no proxy argument
    # is passed anywhere and behaviour is identical to before this existed.
    #
    # 💸 The variable is free; the service behind it is not. Leaving it unset
    # costs nothing. Setting it to a residential/mobile proxy URL is a usage-priced
    # line item (~$2-8/GB) and should only happen once datacenter-IP blocking
    # measurably costs more than the proxy does — see docs/CONTEXT.md
    # § "Extraction & bot-detection". Never point this at a free public proxy
    # list: they are slower than being blocked and can read the traffic.
    EXTRACTOR_PROXY_URL: str = os.getenv("EXTRACTOR_PROXY_URL", "")
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    # New "Publishable" key (sb_publishable_...). Safe to share. Falls back to the
    # older SUPABASE_ANON_KEY name if that's what's set.
    SUPABASE_PUBLISHABLE_KEY: str = (
        os.getenv("SUPABASE_PUBLISHABLE_KEY", "") or os.getenv("SUPABASE_ANON_KEY", "")
    )
    # Backend-only secret (NEVER expose to the mobile bundle). The new sb_secret_...
    # key; bypasses row-level security for admin/server operations.
    SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    # Public JWKS endpoint — verifies the ECC-signed access tokens (Phase 2). Defaults
    # to the standard path under SUPABASE_URL when not set explicitly.
    SUPABASE_JWKS_URL: str = os.getenv("SUPABASE_JWKS_URL", "") or (
        f"{os.getenv('SUPABASE_URL', '').rstrip('/')}/auth/v1/.well-known/jwks.json"
        if os.getenv("SUPABASE_URL") else ""
    )
    # Optional. Set to a Sentry DSN to enable error monitoring; empty = disabled.
    SENTRY_DSN: str = os.getenv("SENTRY_DSN", "")
    # Shared secret the RevenueCat webhook must present (dashboard → webhook
    # "Authorization header value"). Empty = the billing webhook rejects every
    # call, so it's fail-closed until you configure it.
    REVENUECAT_WEBHOOK_TOKEN: str = os.getenv("REVENUECAT_WEBHOOK_TOKEN", "")
    ENV: str = os.getenv("ENV", "development")
    # Comma-separated browser origins allowed in production (the deployed web app's
    # URL). "*" allows any origin — acceptable while there's no cookie-based auth.
    ALLOWED_ORIGINS: str = os.getenv("ALLOWED_ORIGINS", "*")
    # Driver-agnostic. Defaults to local SQLite; set DATABASE_URL to a Postgres URL
    # in production (lands with auth). SQLAlchemy picks the driver from the scheme.
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./savehere.db")
    # ── Tier system (see app/entitlements.py) ────────────────────────────────
    # Per-user AI actions allowed per UTC day (summaries, recipes, workouts, asks
    # all count). The real spend ceiling per user — env-overridable so the budget
    # can be tightened without a deploy. This is the IN-TRIAL limit (the name is
    # kept from when free==trial, so existing env files/dashboards keep working).
    # Owner-set 2026-07-27: trial 10 / free 3 / pro 20.
    AI_DAILY_LIMIT: int = int(os.getenv("AI_DAILY_LIMIT", "10"))
    # Post-trial free tier: a small daily trickle keeps the product alive enough
    # to convert instead of going view-only (owner decision 2026-07-10).
    AI_FREE_DAILY_LIMIT: int = int(os.getenv("AI_FREE_DAILY_LIMIT", "3"))
    # Paid tier's daily AI-action limit. Applies to users whose JWT carries
    # app_metadata.tier == "pro" (set server-side: scripts/set_tier.py now, the
    # RevenueCat/IAP webhook at launch). Owner-set 2026-08-10 to 20/day, paired
    # with ₹99 / $7 per month (history: 100 -> 20 -> 25 -> 15 -> 20).
    # ⚠️ This is a DELIBERATE cross-subsidy, not a break-even number. At
    # ~$0.004/action, 20/day is ~$2.43/mo worst case: $7 nets $5.95 after Apple's
    # 15% and clears it ~2.4x, but ₹99 nets ~$0.96 — a maxing INR Pro user costs
    # ~2.5x their subscription. Owner's call (2026-08-10): run India generous on
    # volume and cover it from US margin, revisit after 6 months.
    # ⚠️ RAISING this number makes the INR gap WIDER, never narrower — the cap IS
    # the worst case. ₹99 breaks even at ~8/day. The levers are a lower cap or a
    # higher price; if it ever needs closing, the seam is a storefront-specific
    # tier (daily_limit_for() in quota.py already branches on tier — one constant
    # plus a "pro_in" stamp), not a tweak here.
    # ⚠️ Only 2x the trial's 10/day — the Pro upgrade story rests on FEATURE
    # gating (ask/tasks/itinerary, see entitlements.py), not the size of the cap.
    AI_PRO_DAILY_LIMIT: int = int(os.getenv("AI_PRO_DAILY_LIMIT", "20"))
    # Trial length in days, counted from the user's first authenticated request.
    TRIAL_DAYS: int = int(os.getenv("TRIAL_DAYS", "10"))
    # Post-trial free tier: total saves allowed (existing saves are grandfathered
    # — the cap gates NEW saves only; view/search/delete are never locked).
    FREE_SAVE_LIMIT: int = int(os.getenv("FREE_SAVE_LIMIT", "20"))

settings = Settings()
