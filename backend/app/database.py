from sqlalchemy import create_engine, event, Column, String, DateTime, Date, JSON, Text, Integer, Boolean, ForeignKey, text
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime
import uuid

from app.config import settings

# check_same_thread is a SQLite-only flag; omit it for Postgres/other drivers so a
# DATABASE_URL swap (with auth) needs no code change.
_is_sqlite = settings.DATABASE_URL.startswith("sqlite")
_connect_args = {"check_same_thread": False} if _is_sqlite else {}
engine = create_engine(settings.DATABASE_URL, connect_args=_connect_args)

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


class AiUsageDB(Base):
    """Per-user, per-UTC-day count of AI actions — the daily quota counter.

    DB-backed (unlike the in-memory per-IP rate limiter) so it survives restarts/
    redeploys and can't be reset by rotating IPs. One row per user per day; the
    quota helper increments `count` and refuses once it hits the limit."""
    __tablename__ = "ai_usage"

    user_id = Column(String, primary_key=True)
    day = Column(Date, primary_key=True)
    count = Column(Integer, nullable=False, default=0)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    Base.metadata.create_all(bind=engine)
    # migrate existing tables — safe to run repeatedly
    with engine.connect() as conn:
        for stmt in [
            "ALTER TABLE reels ADD COLUMN notes TEXT",
            "ALTER TABLE reels ADD COLUMN summarize_count INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE reels ADD COLUMN tasks_count INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE reels ADD COLUMN workout_count INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE reels ADD COLUMN summary_status TEXT NOT NULL DEFAULT 'ready'",
            "ALTER TABLE reels ADD COLUMN user_id TEXT",
            "CREATE INDEX IF NOT EXISTS ix_reels_user_id ON reels (user_id)",
            "ALTER TABLE tasks ADD COLUMN kind TEXT DEFAULT 'task'",
            "ALTER TABLE tasks ADD COLUMN source TEXT DEFAULT 'content'",
        ]:
            try:
                conn.execute(text(stmt))
                conn.commit()
            except Exception:
                pass  # column already exists
