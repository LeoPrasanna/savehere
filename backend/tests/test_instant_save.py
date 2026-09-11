"""Instant-save path: POST /save returns a pending card immediately; the
extraction + quota charge + summary chain runs in the background and fills the
card in. conftest's autouse fixture runs that chain inline (see _enqueue), so the
end state is assertable right after the call. No network: extractor and
summarizer are monkeypatched."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, ReelDB, AiUsageDB, get_db
from app.quota import quota_subject
from app.auth import get_current_user, AuthUser
from app.routes import reels as reels_module

USER = "user-instant"

# The daily AI counter is keyed on a STABLE subject (hash of the normalized
# email), not the raw user id — see quota.quota_subject. That is what stops
# "delete the account, get a fresh quota". Assert against the same key the
# app writes, or these tests pass while the real counter goes unread.
QUOTA_KEY = quota_subject(AuthUser(id=USER, email="t@e.co"))

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
                        lambda platform, title, text, meta=None: dict(FAKE_AI))

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
            row = db.query(AiUsageDB).filter(AiUsageDB.user_id == QUOTA_KEY).first()
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
        """Out of AI actions: keep the card, spend nothing, say why.

        The status assertion is the load-bearing one. It used to be 'failed',
        which drove the detail screen's "Something interrupted the AI summary —
        tap to try again" state: a retry that cannot succeed until the reset,
        offered all day, on a save that never actually failed."""
        client, Session = env
        called = []
        monkeypatch.setattr(reels_module.summarizer, "summarize",
                            lambda **kw: called.append(kw) or dict(FAKE_AI))
        monkeypatch.setattr("app.quota.settings.AI_DAILY_LIMIT", 0)

        r = client.post("/api/reels/save", json={"url": "https://youtube.com/shorts/quotafull"})
        assert r.status_code == 200

        reel = _get_reel(Session, r.json()["id"])
        # The free work still happened — the card is a usable bookmark.
        assert reel.thumbnail_url == FAKE_INFO["thumbnail_url"]
        assert reel.title
        # The paid work did not, and is reported as a budget state, not a fault.
        assert reel.summary_status == reels_module.QUOTA_STATUS
        assert reel.summary in ([], None)
        # THE POINT: no Claude call was made. A charge is taken before the API
        # call precisely so a refused charge costs nothing.
        assert called == [], "summarizer must not run once the daily budget is spent"

    def test_quota_exhausted_state_is_not_failed(self, env, monkeypatch):
        """Guards the distinction itself: these two statuses drive different UI
        (retry button vs "resumes tomorrow"), so collapsing them is a regression
        even though both mean "no summary"."""
        client, Session = env
        monkeypatch.setattr("app.quota.settings.AI_DAILY_LIMIT", 0)
        r = client.post("/api/reels/save", json={"url": "https://youtube.com/shorts/quotafull2"})
        assert _get_reel(Session, r.json()["id"]).summary_status != "failed"

    def test_long_video_becomes_link_only_bookmark(self, env, monkeypatch):
        client, Session = env
        long_info = dict(FAKE_INFO, duration=1200)
        monkeypatch.setattr(reels_module.extractor, "extract_info", lambda url: long_info)
        r = client.post("/api/reels/save", json={"url": "https://youtube.com/watch?v=longform1"})
        assert r.status_code == 200
        reel = _get_reel(Session, r.json()["id"])
        assert reel.summary_status == "skipped"  # no AI spend on long-form


# ── Auto-summary: full for everyone, index behind a flag ─────────────────────
#
# ⚠️ THE DEFAULT IS A FULL SUMMARY ON EVERY TIER. Gating free saves to the cheap
# index pass shipped on 2026-09-11 and the owner reverted it the same day: the
# automatic summary is what the product is. These tests keep the index path
# covered in BOTH positions so turning it back on is a config change rather
# than a rediscovery — the cost argument for it is in TODO.md and is unchanged.

def _expire_trial(Session, user_id):
    from app.database import ProfileDB
    from datetime import datetime, timedelta
    db = Session()
    try:
        p = db.query(ProfileDB).filter(ProfileDB.user_id == user_id).first()
        if p is None:
            p = ProfileDB(user_id=user_id, trial_extra_days=0, created_at=datetime.utcnow())
            db.add(p)
        p.trial_started_at = datetime.utcnow() - timedelta(days=60)
        db.commit()
    finally:
        db.close()


def test_free_tier_save_is_summarized_in_full_by_default(env, monkeypatch):
    client, Session = env
    calls = []
    monkeypatch.setattr(reels_module.summarizer, "summarize",
                        lambda **kw: calls.append("full") or dict(FAKE_AI))
    monkeypatch.setattr(reels_module.summarizer, "index_only",
                        lambda **kw: calls.append("index") or
                        {"title": "t", "summary": [], "tags": ["a", "b"],
                         "category": "tech", "low_content": False, "sensitive": False})

    client.get("/api/account/usage")        # creates the profile
    _expire_trial(Session, USER)
    r = client.post("/api/reels/save", json={"url": "https://youtube.com/shorts/freeuser1"})
    assert r.status_code == 200, r.text

    reel = _get_reel(Session, r.json()["id"])
    assert calls == ["full"], f"free must get the full summary by default, got {calls}"
    assert reel.summary == FAKE_AI["summary"]
    assert reel.summary_status == "ready"


def test_free_tier_save_is_indexed_when_the_gate_is_on(env, monkeypatch):
    """The path is kept and covered: flipping one setting re-gates it."""
    from app.config import settings
    client, Session = env
    monkeypatch.setattr(settings, "FREE_AUTO_SUMMARY", False)
    calls = []
    monkeypatch.setattr(reels_module.summarizer, "summarize",
                        lambda **kw: calls.append("full") or dict(FAKE_AI))
    monkeypatch.setattr(reels_module.summarizer, "index_only",
                        lambda **kw: calls.append("index") or
                        {"title": "t", "summary": [], "tags": ["a", "b"],
                         "category": "tech", "low_content": False, "sensitive": False})

    client.get("/api/account/usage")
    _expire_trial(Session, USER)
    r = client.post("/api/reels/save", json={"url": "https://youtube.com/shorts/gated1"})
    assert r.status_code == 200, r.text

    reel = _get_reel(Session, r.json()["id"])
    assert calls == ["index"], f"expected the cheap pass, got {calls}"
    assert reel.summary == []
    assert reel.tags == ["a", "b"]          # the library stays searchable
    assert reel.category == "tech"          # and the category rail still works
    # ⚠️ 'indexed', NOT 'skipped'. Both leave summary empty; the app tells the
    # user two different things. "skipped" claims we read it and found nothing.
    assert reel.summary_status == "indexed"


def test_trial_tier_save_gets_the_full_summary(env):
    client, Session = env
    r = client.post("/api/reels/save", json={"url": "https://youtube.com/shorts/trialuser"})
    assert r.status_code == 200, r.text
    reel = _get_reel(Session, r.json()["id"])
    assert reel.summary == FAKE_AI["summary"]
    assert reel.summary_status == "ready"


def test_summarize_now_runs_full_even_when_gated(env, monkeypatch):
    """The flag gates AUTOMATIC summaries. A summary the user asked for by name
    — and was charged an AI action for — is always the full thing."""
    from app.config import settings
    client, Session = env
    monkeypatch.setattr(settings, "FREE_AUTO_SUMMARY", False)
    calls = []
    monkeypatch.setattr(reels_module.summarizer, "summarize",
                        lambda **kw: calls.append("full") or dict(FAKE_AI))
    monkeypatch.setattr(reels_module.summarizer, "index_only",
                        lambda **kw: calls.append("index") or
                        {"title": "t", "summary": [], "tags": [], "category": "other",
                         "low_content": False, "sensitive": False})

    client.get("/api/account/usage")
    _expire_trial(Session, USER)
    rid = client.post("/api/reels/save", json={"url": "https://youtube.com/shorts/freeuser2"}).json()["id"]
    assert calls == ["index"]

    calls.clear()
    r = client.post(f"/api/reels/{rid}/resummarize")
    assert r.status_code == 200, r.text
    assert calls == ["full"], f"a paid-for summary must be the full one, got {calls}"
    assert _get_reel(Session, rid).summary == FAKE_AI["summary"]
