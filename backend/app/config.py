from dotenv import load_dotenv
import os

load_dotenv(override=True)

class Settings:
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    APIFY_API_KEY: str = os.getenv("APIFY_API_KEY", "")
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
    AI_DAILY_LIMIT: int = int(os.getenv("AI_DAILY_LIMIT", "30"))
    # Post-trial free tier: a small daily trickle keeps the product alive enough
    # to convert instead of going view-only (owner decision 2026-07-10).
    AI_FREE_DAILY_LIMIT: int = int(os.getenv("AI_FREE_DAILY_LIMIT", "3"))
    # Paid tier's daily AI-action limit. Applies to users whose JWT carries
    # app_metadata.tier == "pro" (set server-side: scripts/set_tier.py now, the
    # RevenueCat/IAP webhook at launch). Placeholder until pricing is finalized.
    AI_PRO_DAILY_LIMIT: int = int(os.getenv("AI_PRO_DAILY_LIMIT", "100"))
    # Trial length in days, counted from the user's first authenticated request.
    TRIAL_DAYS: int = int(os.getenv("TRIAL_DAYS", "10"))
    # Post-trial free tier: total saves allowed (existing saves are grandfathered
    # — the cap gates NEW saves only; view/search/delete are never locked).
    FREE_SAVE_LIMIT: int = int(os.getenv("FREE_SAVE_LIMIT", "20"))

settings = Settings()
