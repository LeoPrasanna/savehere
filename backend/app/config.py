from dotenv import load_dotenv
import os

load_dotenv()

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

settings = Settings()
