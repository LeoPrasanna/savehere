"""Preflight checks must run BEFORE the AI quota charge.

Charging before the Claude call is correct once the call happens — the tokens are
really spent. The bug this pins is the case where the call could never have
produced anything: an unreadable save (no text, no notes, only a generic
placeholder title like "Instagram Reel") used to cost the user an AI action to
receive a guaranteed 422.

Contract: hopeless input -> 422 AND zero AI actions charged.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, ReelDB, AiUsageDB, get_db
from app.quota import quota_subject
from app.auth import get_current_user, AuthUser
from app.routes import workout as workout_route
from app import ratelimit

USER = "user-preflight"

# The daily AI counter is keyed on a STABLE subject (hash of the normalized
# email), not the raw user id — see quota.quota_subject. That is what stops
# "delete the account, get a fresh quota". Assert against the same key the
# app writes, or these tests pass while the real counter goes unread.
QUOTA_KEY = quota_subject(AuthUser(id=USER, email="t@e.co"))


@pytest.fixture
def env(monkeypatch):
    # CI has no ANTHROPIC_API_KEY and tests must never make a live AI call, so
    # stub the extractor. The refusal cases below never reach it — but the
    # "still passes preflight" case does, by design.
    monkeypatch.setattr(workout_route.workout_extractor, "extract_tasks",
                        lambda **kw: {"kind": "steps", "source": "content",
                                      "tasks": [{"text": "Knead the dough", "emoji": "🥟"}]})
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    TestingSession = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    Base.metadata.create_all(bind=engine)

    def _override_get_db():
        s = TestingSession()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_current_user] = lambda: AuthUser(id=USER, email="t@e.co")
    ratelimit._store.clear()
    yield TestClient(app), TestingSession
    app.dependency_overrides.clear()


def _unreadable_reel(Session, category):
    """A save the extractor couldn't read: no text, no notes, placeholder title."""
    s = Session()
    reel = ReelDB(user_id=USER, url=f"https://www.instagram.com/reel/{category}",
                  platform="instagram", title="Instagram Reel", raw_text="", notes="",
                  category=category, summary_status="skipped", summary=[], tags=[])
    s.add(reel)
    s.commit()
    rid = reel.id
    s.close()
    return rid


def _charged(Session):
    s = Session()
    try:
        row = s.query(AiUsageDB).filter(AiUsageDB.user_id == QUOTA_KEY).first()
        return row.count if row else 0
    finally:
        s.close()


@pytest.mark.parametrize("category,path", [
    ("cooking", "tasks"),      # recipe: title is normally enough, but not a placeholder one
    ("tech", "tasks"),         # non-cooking tasks need real content
    ("fitness", "workout"),
    ("travel", "itinerary"),
])
def test_unreadable_save_is_refused_without_charging(env, category, path):
    client, Session = env
    rid = _unreadable_reel(Session, category)

    r = client.post(f"/api/reels/{rid}/{path}")

    assert r.status_code == 422, r.text
    assert _charged(Session) == 0, f"{path} charged an AI action for input that cannot produce output"


def test_real_content_still_passes_preflight(env):
    """Guard against over-blocking: a save WITH content must not be refused here.
    (It gets past preflight and charges; the AI call itself is out of scope.)"""
    client, Session = env
    s = Session()
    reel = ReelDB(user_id=USER, url="https://www.instagram.com/reel/hascontent",
                  platform="instagram", title="Instagram Reel",
                  raw_text="Step one, knead the dough well. Step two, rest it for twenty minutes.",
                  notes="", category="cooking", summary_status="ready", summary=[], tags=[])
    s.add(reel)
    s.commit()
    rid = reel.id
    s.close()

    r = client.post(f"/api/reels/{rid}/tasks")
    # Whatever the AI does, preflight must NOT have been the thing that stopped it.
    assert "nothing readable" not in r.text.lower()
    assert _charged(Session) == 1, "real content should get past preflight and be charged"


# ── Link-only captions (owner report, 2026-08-12) ────────────────────────────
#
# The gap the tests above did NOT cover: preflight asked "is raw_text non-empty?"
# A caption that is entirely "📌 Follow us here:" plus three URLs is ~150
# characters — non-empty, well past any length bar, and worth nothing. It sailed
# through, charged an AI action, called Claude and came back with a 422.
#
# That is also exactly WHY these reels show no summary: the save path already
# runs extractor.is_link_only() and marks them 'skipped' without spending
# anything. "No summary" and "no AI action charged" have to agree.

LINK_ONLY_CAPTION = (
    "📌Follow us on Instagram here: https://instagram.com/someaccount "
    "https://linktr.ee/someaccount https://youtube.com/@someaccount"
)


def _link_only_reel(Session, category, *, notes=""):
    s = Session()
    reel = ReelDB(user_id=USER, url=f"https://www.instagram.com/reel/lo-{category}",
                  platform="instagram", title="Instagram Reel",
                  raw_text=LINK_ONLY_CAPTION, notes=notes,
                  category=category, summary_status="skipped", summary=[], tags=[])
    s.add(reel)
    s.commit()
    rid = reel.id
    s.close()
    return rid


@pytest.mark.parametrize("category,path", [
    ("cooking", "tasks"),
    ("tech", "tasks"),
    ("fitness", "workout"),
    ("travel", "itinerary"),
])
def test_link_only_caption_is_refused_without_charging(env, category, path):
    client, Session = env
    rid = _link_only_reel(Session, category)

    r = client.post(f"/api/reels/{rid}/{path}")

    assert r.status_code == 422, r.text
    assert _charged(Session) == 0, (
        f"{path} charged an AI action for a caption that is only links — "
        "the same input the save path refuses to summarize for free"
    )


def test_notes_rescue_a_link_only_caption(env):
    """The documented recovery path must still work.

    Notes are first-party input and are NEVER link-filtered: "paste the post
    text into Notes" is the advice every unreadable-save message gives, and it
    would be a lie if the note were then discarded for sitting next to a
    link-only caption.
    """
    client, Session = env
    rid = _link_only_reel(
        Session, "cooking",
        notes="Knead the dough for ten minutes, rest it, then roll thin and pan-fry.",
    )

    r = client.post(f"/api/reels/{rid}/tasks")

    assert r.status_code == 200, r.text
    assert _charged(Session) == 1
