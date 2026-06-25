from dotenv import load_dotenv
import os

load_dotenv()

class Settings:
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    APIFY_API_KEY: str = os.getenv("APIFY_API_KEY", "")
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")
    ENV: str = os.getenv("ENV", "development")
    # Comma-separated browser origins allowed in production (the deployed web app's
    # URL). "*" allows any origin — acceptable while there's no cookie-based auth.
    ALLOWED_ORIGINS: str = os.getenv("ALLOWED_ORIGINS", "*")
    # Driver-agnostic. Defaults to local SQLite; set DATABASE_URL to a Postgres URL
    # in production (lands with auth). SQLAlchemy picks the driver from the scheme.
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./savehere.db")

settings = Settings()
