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
from app.auth import get_current_user, AuthUser
from app import ratelimit

USER = "user-preflight"


@pytest.fixture
def env():
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
        row = s.query(AiUsageDB).filter(AiUsageDB.user_id == USER).first()
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
    assert "no readable content" not in r.text.lower()
