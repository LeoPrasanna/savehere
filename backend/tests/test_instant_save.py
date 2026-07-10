"""Instant-save path: POST /save returns a pending card immediately; the
extraction + quota charge + summary chain runs in the background and fills the
card in. TestClient executes FastAPI BackgroundTasks before returning, so the
end state is assertable right after the call. No network: extractor and
summarizer are monkeypatched."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, ReelDB, AiUsageDB, get_db
from app.auth import get_current_user, AuthUser
from app.routes import reels as reels_module

USER = "user-instant"

FAKE_INFO = {
    "platform": "youtube",
    "title": "How to sharpen a knife",
    "caption": "",
    "transcript": "",
    "best_text": "Hold the blade at fifteen degrees and draw it across the stone slowly." * 2,
    "thumbnail_url": "https://i.ytimg.com/vi/x/hq.jpg",
    "uploader": "chef",
    "duration": 55,
    "needs_audio": False,
    "extracted": True,
}

FAKE_AI = {"summary": ["15° angle", "slow draws"], "tags": ["knives"], "category": "cooking", "title": "Knife Sharpening Basics"}


@pytest.fixture
def env(monkeypatch):
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

    # Background workers open their own sessions via SessionLocal — point it at
    # the test engine.
    monkeypatch.setattr(reels_module, "SessionLocal", TestingSession)
    monkeypatch.setattr(reels_module.extractor, "extract_info", lambda url: dict(FAKE_INFO))
    monkeypatch.setattr(reels_module.summarizer, "summarize",
                        lambda platform, title, text: dict(FAKE_AI))

    yield TestClient(app), TestingSession
    app.dependency_overrides.clear()


def _get_reel(Session, rid):
    db = Session()
    try:
        return db.query(ReelDB).filter(ReelDB.id == rid).first()
    finally:
        db.close()


class TestInstantSave:
    def test_card_filled_and_summarized_in_background(self, env):
        client, Session = env
        r = client.post("/api/reels/save", json={"url": "https://youtube.com/shorts/abc123xyz"})
        assert r.status_code == 200
        rid = r.json()["id"]
        # background chain already ran (TestClient) → card is complete
        reel = _get_reel(Session, rid)
        assert reel.title == FAKE_AI["title"] or reel.title == FAKE_INFO["title"]
        assert reel.thumbnail_url == FAKE_INFO["thumbnail_url"]
        assert reel.summary_status == "ready"
        assert reel.summary == FAKE_AI["summary"]

    def test_summary_charged_against_quota(self, env):
        client, Session = env
        client.post("/api/reels/save", json={"url": "https://youtube.com/shorts/abc123xyz"})
        db = Session()
        try:
            row = db.query(AiUsageDB).filter(AiUsageDB.user_id == USER).first()
            assert row is not None and row.count == 1
        finally:
            db.close()

    def test_unknown_link_rejected_sync(self, env):
        client, _ = env
        r = client.post("/api/reels/save", json={"url": "https://example.com/nonsense"})
        assert r.status_code == 422

    def test_extraction_failure_degrades_to_retryable_bookmark(self, env, monkeypatch):
        client, Session = env
        def boom(url):
            raise RuntimeError("bot check")
        monkeypatch.setattr(reels_module.extractor, "extract_info", boom)
        r = client.post("/api/reels/save", json={"url": "https://youtube.com/shorts/failcase1"})
        assert r.status_code == 200          # the card still saves
        reel = _get_reel(Session, r.json()["id"])
        assert reel.summary_status == "failed"   # retryable, honest
        assert reel.title                        # clean fallback label

    def test_quota_exhausted_saves_without_summary(self, env, monkeypatch):
        client, Session = env
        monkeypatch.setattr("app.quota.settings.AI_DAILY_LIMIT", 0)
        r = client.post("/api/reels/save", json={"url": "https://youtube.com/shorts/quotafull"})
        assert r.status_code == 200
        reel = _get_reel(Session, r.json()["id"])
        # metadata still filled; summary refused without charging
        assert reel.thumbnail_url == FAKE_INFO["thumbnail_url"]
        assert reel.summary_status == "failed"
        assert reel.summary in ([], None)

    def test_long_video_becomes_link_only_bookmark(self, env, monkeypatch):
        client, Session = env
        long_info = dict(FAKE_INFO, duration=1200)
        monkeypatch.setattr(reels_module.extractor, "extract_info", lambda url: long_info)
        r = client.post("/api/reels/save", json={"url": "https://youtube.com/watch?v=longform1"})
        assert r.status_code == 200
        reel = _get_reel(Session, r.json()["id"])
        assert reel.summary_status == "skipped"  # no AI spend on long-form
