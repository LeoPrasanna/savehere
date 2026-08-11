"""POST /api/reels/{id}/client-metadata — metadata the app fetched from the
user's own (residential) IP, for links our datacenter IP can't read (Instagram /
Facebook). This is untrusted client input, so the tests below pin the trust
boundary as much as the happy path:

  * server extraction always wins over the client payload,
  * the payload's URL must match the reel it's attached to,
  * ownership is enforced (someone else's reel -> 404),
  * oversize text is rejected by the schema before any handler runs.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, ReelDB, AiUsageDB, get_db
from app.auth import get_current_user, AuthUser
from app.routes import reels as reels_module
from app import ratelimit

USER = "user-clientmeta"
OTHER = "user-someone-else"
IG_URL = "https://www.instagram.com/reel/DbFk4JxgYkT"
LONG_TEXT = ("Teri roti thandi hote hi pathar kyun ban jaati hai? "
             "Yeh atta nahi hai, yeh chemistry hai. Do secrets for soft rotis.") * 3

FAKE_AI = {"summary": ["knead well", "rest the dough"], "tags": ["cooking"],
           "category": "cooking", "title": "Soft Roti Secrets"}


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
    monkeypatch.setattr(reels_module, "SessionLocal", TestingSession)
    monkeypatch.setattr(reels_module.summarizer, "summarize",
                        lambda platform, title, text, meta=None: dict(FAKE_AI))
    # Per-IP buckets are process-global and TestClient presents one IP — clear so
    # suite-order traffic can't 429 these tests.
    ratelimit._store.clear()

    yield TestClient(app), TestingSession
    app.dependency_overrides.clear()


def _make_reel(Session, *, user=USER, raw_text="", status="skipped", title="Instagram Reel",
               thumbnail=None):
    s = Session()
    reel = ReelDB(user_id=user, url=IG_URL, platform="instagram", title=title,
                  raw_text=raw_text, summary_status=status, summary=[], tags=[],
                  thumbnail_url=thumbnail)
    s.add(reel)
    s.commit()
    rid = reel.id
    s.close()
    return rid


def _payload(**over):
    body = {"url": IG_URL, "title": "Chef Prasad on Instagram", "text": LONG_TEXT,
            "thumbnail_url": "https://cdninstagram.com/x.jpg", "uploader": "thebombaydon"}
    body.update(over)
    return body


def test_fills_and_summarizes_when_server_extraction_found_nothing(env):
    """The core case: Render couldn't read the IG caption, the phone could."""
    client, Session = env
    rid = _make_reel(Session)

    r = client.post(f"/api/reels/{rid}/client-metadata", json=_payload())
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["summary_status"] == "ready"
    assert body["summary"] == FAKE_AI["summary"]

    s = Session()
    reel = s.query(ReelDB).filter(ReelDB.id == rid).first()
    assert reel.raw_text.startswith("Teri roti")
    assert reel.thumbnail_url == "https://cdninstagram.com/x.jpg"
    assert reel.uploader == "thebombaydon"
    # The AI action was charged exactly once.
    assert s.query(AiUsageDB).filter(AiUsageDB.user_id == USER).first().count == 1
    s.close()


def test_server_data_wins_and_costs_nothing(env):
    """If our own extraction already produced usable text, the client payload is
    ignored — this is what bounds a lying client to unreadable saves."""
    client, Session = env
    server_text = "Real text the server extracted itself, comfortably over the limit."
    rid = _make_reel(Session, raw_text=server_text, status="ready")

    r = client.post(f"/api/reels/{rid}/client-metadata", json=_payload(text="INJECTED " * 50))
    assert r.status_code == 200

    s = Session()
    reel = s.query(ReelDB).filter(ReelDB.id == rid).first()
    assert reel.raw_text == server_text          # untouched
    assert s.query(AiUsageDB).filter(AiUsageDB.user_id == USER).first() is None  # no charge
    s.close()


def test_url_mismatch_is_rejected(env):
    """A client must not be able to staple text from one link onto another reel."""
    client, Session = env
    rid = _make_reel(Session)
    r = client.post(f"/api/reels/{rid}/client-metadata",
                    json=_payload(url="https://www.instagram.com/reel/SOMETHINGELSE"))
    assert r.status_code == 422
    assert "doesn't belong" in r.json()["detail"]


def test_other_users_reel_is_404(env):
    client, Session = env
    rid = _make_reel(Session, user=OTHER)
    r = client.post(f"/api/reels/{rid}/client-metadata", json=_payload())
    assert r.status_code == 404


def test_oversize_text_rejected_by_schema(env):
    """Size cap is enforced by the model, before the handler runs."""
    client, Session = env
    rid = _make_reel(Session)
    r = client.post(f"/api/reels/{rid}/client-metadata", json=_payload(text="x" * 20_001))
    assert r.status_code == 422


def test_does_not_downgrade_while_server_extraction_is_still_running(env):
    """Regression: this payload lands within a second of /save, long before the
    background chain finishes. Marking a still-'pending' reel as 'skipped' made
    the app stop polling (the detail screen only polls while pending), so the
    summary that arrived seconds later stayed invisible until a manual reload.

    The common trigger is YouTube: the client only has oEmbed, and oEmbed carries
    no description — so the payload is always text-less there.
    """
    client, Session = env
    rid = _make_reel(Session, status="pending", title=None)

    r = client.post(f"/api/reels/{rid}/client-metadata",
                    json=_payload(title="3 Bali Travel Tips", text=""))
    assert r.status_code == 200
    assert r.json()["summary_status"] == "pending", \
        "downgraded a reel the server was still extracting — the app stops polling"

    s = Session()
    reel = s.query(ReelDB).filter(ReelDB.id == rid).first()
    assert reel.summary_status == "pending"
    assert reel.title == "3 Bali Travel Tips"      # the title we gained is kept
    s.close()


def test_short_client_text_stays_skipped_but_keeps_title(env):
    """Client couldn't read it either (CORS on web / private post): don't invent a
    summary, but keep the title+thumbnail we did gain."""
    client, Session = env
    rid = _make_reel(Session)
    r = client.post(f"/api/reels/{rid}/client-metadata", json=_payload(text="too short"))
    assert r.status_code == 200
    assert r.json()["summary_status"] == "skipped"

    s = Session()
    reel = s.query(ReelDB).filter(ReelDB.id == rid).first()
    assert reel.title == "Chef Prasad on Instagram"   # weak title was upgraded
    assert reel.thumbnail_url == "https://cdninstagram.com/x.jpg"
    assert s.query(AiUsageDB).filter(AiUsageDB.user_id == USER).first() is None  # no charge
    s.close()
