from sqlalchemy import create_engine, event, Column, String, DateTime, Date, JSON, Text, Integer, Boolean, ForeignKey
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime
import uuid

from app.config import settings

# check_same_thread is a SQLite-only flag; omit it for Postgres/other drivers so a
# DATABASE_URL swap (with auth) needs no code change.
_is_sqlite = settings.DATABASE_URL.startswith("sqlite")
_connect_args = {"check_same_thread": False} if _is_sqlite else {}
# pool_pre_ping: the Supabase pooler recycles idle connections, so a pooled
# connection can be dead by the time we reuse it. Pre-ping validates it first,
# turning "server closed the connection unexpectedly" 500s into a transparent
# reconnect. Harmless on SQLite.
engine = create_engine(settings.DATABASE_URL, connect_args=_connect_args, pool_pre_ping=True)

if _is_sqlite:
    # SQLite ignores ON DELETE CASCADE unless foreign_keys is switched on per
    # connection — without this, deleting a reel strands its tasks/exercises.
    @event.listens_for(engine, "connect")
    def _enable_sqlite_fks(dbapi_conn, _record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class ReelDB(Base):
    __tablename__ = "reels"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    # Owner (Supabase user id / JWT `sub`). Nullable so a pre-auth row or a migration
    # doesn't fail; every new save sets it. Indexed — every list/search filters on it.
    user_id = Column(String, nullable=True, index=True)
    # NOT globally unique: two users may save the same link. Dedup is per-user in the
    # save route (url + user_id). Indexed for that lookup.
    url = Column(String, nullable=False, index=True)
    platform = Column(String, nullable=False)
    title = Column(Text, nullable=True)
    thumbnail_url = Column(String, nullable=True)
    uploader = Column(String, nullable=True)
    duration = Column(Integer, nullable=True)
    summary = Column(JSON, nullable=True)
    tags = Column(JSON, nullable=True)
    category = Column(String, nullable=True)
    # pending = card saved, AI summary running in background; ready = summarized;
    # skipped = nothing readable to summarize; failed = summary errored (retryable).
    summary_status = Column(String, nullable=False, default="ready")
    raw_text = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    summarize_count = Column(Integer, nullable=False, default=0)
    tasks_count = Column(Integer, nullable=False, default=0)        # AI task/recipe generations
    workout_count = Column(Integer, nullable=False, default=0)      # AI workout generations
    itinerary_count = Column(Integer, nullable=False, default=0)    # AI itinerary generations (travel)
    # Stored trip itinerary (travel reels, Pro feature). JSON blob rather than a
    # child table: items aren't individually editable like tasks/exercises, so a
    # single document is simpler and regenerates atomically.
    itinerary = Column(JSON, nullable=True)
    # Flagged by the summarizer when the content is medical/high-stakes health or
    # safety advice. Sensitive reels keep thumbnail+summary+notes but are never
    # turned into tasks/workouts (enforced server-side in routes/workout.py) and
    # the app shows a "not responsible" disclaimer.
    is_sensitive = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class ExtractionCacheDB(Base):
    """
    Caches successful yt-dlp extractions keyed by canonical URL. Survives reel
    deletion, so deleting and re-saving the same link is instant and never
    re-hits the source platform (fewer requests = less throttling).
    """
    __tablename__ = "extraction_cache"

    url = Column(String, primary_key=True)
    platform = Column(String, nullable=False)
    title = Column(Text, nullable=True)
    caption = Column(Text, nullable=True)
    transcript = Column(Text, nullable=True)
    best_text = Column(Text, nullable=True)
    thumbnail_url = Column(String, nullable=True)
    uploader = Column(String, nullable=True)
    duration = Column(Integer, nullable=True)
    needs_audio = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class WorkoutExerciseDB(Base):
    __tablename__ = "workout_exercises"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    reel_id = Column(String, ForeignKey("reels.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    type = Column(String, default="strength")        # strength | cardio | core | flexibility
    muscle_group = Column(String, default="full_body")
    sets = Column(Integer, nullable=True)
    reps = Column(Integer, nullable=True)
    duration_seconds = Column(Integer, nullable=True) # for holds: plank, wall-sit
    rest_seconds = Column(Integer, default=60)
    is_estimated = Column(Boolean, default=False)
    sort_order = Column(Integer, default=0)
    workout_name = Column(String, nullable=True)
    difficulty = Column(String, default="intermediate")
    estimated_minutes = Column(Integer, default=20)


class TaskDB(Base):
    __tablename__ = "tasks"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    reel_id = Column(String, ForeignKey("reels.id", ondelete="CASCADE"), nullable=False)
    text = Column(Text, nullable=False)
    emoji = Column(String, default="✅")
    estimated_minutes = Column(Integer, nullable=True)
    completed = Column(Boolean, default=False)
    sort_order = Column(Integer, default=0)
    kind = Column(String, default="task")     # "step" (ordered how-to) | "task" (standalone)
    source = Column(String, default="content") # "content" | "title" | "notes" (how it was derived)
    created_at = Column(DateTime, default=datetime.utcnow)


class ProfileDB(Base):
    """Server-side per-user state the JWT can't carry (and the client can't
    forge): the trial clock. Created lazily on the user's first authenticated
    request. `trial_extra_days` is the seam a future referral program credits —
    the entitlement math already honors it."""
    __tablename__ = "profiles"

    user_id = Column(String, primary_key=True)
    trial_started_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    trial_extra_days = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class TrialGrantDB(Base):
    """One row per normalized-email hash that has ever consumed a trial.

    Containment for the re-signup loophole: deleting the account (or signing up
    as you+2@gmail.com) yields a new user id, but the normalized email hashes to
    the same row — the new profile inherits the ORIGINAL trial start instead of
    a fresh 10 days. Stores only a SHA-256 of the normalized email, never the
    address itself."""
    __tablename__ = "trial_grants"

    email_hash = Column(String, primary_key=True)
    trial_started_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class AiUsageDB(Base):
    """Per-user, per-UTC-day count of AI actions — the daily quota counter.

    DB-backed (unlike the in-memory per-IP rate limiter) so it survives restarts/
    redeploys and can't be reset by rotating IPs. One row per user per day; the
    quota helper increments `count` and refuses once it hits the limit."""
    __tablename__ = "ai_usage"

    user_id = Column(String, primary_key=True)
    day = Column(Date, primary_key=True)
    count = Column(Integer, nullable=False, default=0)


class AiActionLogDB(Base):
    """One row per successfully charged AI action — the human-readable companion
    to `ai_usage`'s bare counter, so "95 of 100 left" can be expanded into WHAT
    those actions were.

    Deliberately short-lived: rows are pruned past `AI_LOG_RETENTION_DAYS` (see
    app/quota.py). This is a UI convenience, not an audit trail — never make
    anything depend on old rows being here. Written best-effort AFTER the charge
    succeeds, so a logging failure can never block or refund an AI action."""
    __tablename__ = "ai_action_log"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, nullable=False, index=True)
    day = Column(Date, nullable=False, index=True)      # UTC day, matches ai_usage
    action = Column(String, nullable=False)             # summary | tasks | workout | itinerary | ask …
    label = Column(String, nullable=True)               # reel title / question snippet (truncated)
    created_at = Column(DateTime, default=datetime.utcnow)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    """Bring the schema up to date. Alembic is now the single schema authority:
    `alembic upgrade head` creates everything on a fresh DB and applies any new
    migrations on an existing one — idempotent, so a no-op once at head.

    This replaces the old `create_all()` + `ALTER TABLE … except: pass` loop,
    which silently swallowed failures and is unsafe on Postgres (a failed
    statement aborts the whole transaction, so the first duplicate-column error
    would kill every later ALTER — meaning new columns would silently never
    apply to the live DB). See TODO → "Alembic migrations".

    Runs on startup; fine for a single instance. If the app is ever scaled
    horizontally, move this to a one-shot deploy step (Render preDeployCommand)
    so instances don't race to migrate."""
    from pathlib import Path
    from alembic import command
    from alembic.config import Config

    backend_dir = Path(__file__).resolve().parent.parent   # …/backend
    cfg = Config(str(backend_dir / "alembic.ini"))
    # Absolute script location so it works regardless of the process cwd
    # (env.py supplies the DB URL from settings, so no url is set here).
    cfg.set_main_option("script_location", str(backend_dir / "alembic"))
    command.upgrade(cfg, "head")
