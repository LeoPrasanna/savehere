"""Streaming ask endpoint (POST /api/ask/stream): the answer streams as text,
then a trailing sentinel line carries the sources JSON. Mocks auth, the DB, and
the librarian generator so no network/Claude call happens."""
import json
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, ReelDB, AiUsageDB, get_db
from app.quota import quota_subject
from app.auth import get_current_user, AuthUser
from app.routes import ask as ask_module
from app.routes.ask import SOURCES_MARKER

USER = "user-stream"

# The daily AI counter is keyed on a STABLE subject (hash of the normalized
# email), not the raw user id — see quota.quota_subject. That is what stops
# "delete the account, get a fresh quota". Assert against the same key the
# app writes, or these tests pass while the real counter goes unread.
QUOTA_KEY = quota_subject(AuthUser(id=USER, email="t@e.co"))


@pytest.fixture
def env(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    TestingSession = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    Base.metadata.create_all(bind=engine)

    db = TestingSession()
    db.add(ReelDB(id="w1", user_id=USER, url="u1", platform="youtube",
                  title="Chest workout at home", summary=["pushups"], tags=["fitness"],
                  summary_status="ready"))
    db.add(ReelDB(id="w2", user_id=USER, url="u2", platform="instagram",
                  title="Pasta recipe", summary=["boil"], tags=["cooking"],
                  summary_status="ready"))
    db.commit(); db.close()

    def _override_get_db():
        s = TestingSession()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_current_user] = lambda: AuthUser(id=USER, email="t@e.co")

    # Deterministic token stream — no Claude call.
    def fake_stream(question, reels):
        for piece in ["You have ", "a Chest workout ", "at home saved."]:
            yield piece
    monkeypatch.setattr(ask_module.librarian, "stream_answer", fake_stream)

    yield TestClient(app), TestingSession
    app.dependency_overrides.clear()


class TestAskStream:
    def test_streams_answer_then_sources(self, env):
        client, _ = env
        r = client.post("/api/ask/stream", json={"question": "what workouts do I have?"})
        assert r.status_code == 200
        body = r.text
        assert SOURCES_MARKER in body
        answer, _, raw_sources = body.partition(SOURCES_MARKER)
        assert answer == "You have a Chest workout at home saved."
        sources = json.loads(raw_sources)
        # Source computed from the answer text: the chest-workout title is mentioned.
        titles = [s["title"] for s in sources]
        assert "Chest workout at home" in titles
        assert "Pasta recipe" not in titles   # never referenced in the answer

    def test_charges_quota_once(self, env):
        client, Session = env
        client.post("/api/ask/stream", json={"question": "any workouts?"})
        db = Session()
        try:
            row = db.query(AiUsageDB).filter(AiUsageDB.user_id == QUOTA_KEY).first()
            assert row is not None and row.count == 1
        finally:
            db.close()

    def test_short_question_rejected_before_streaming(self, env):
        client, _ = env
        r = client.post("/api/ask/stream", json={"question": "hi"})
        assert r.status_code == 422           # clean error, not a half-written stream

    def test_over_quota_is_clean_429(self, env, monkeypatch):
        client, _ = env
        monkeypatch.setattr("app.quota.settings.AI_DAILY_LIMIT", 0)
        r = client.post("/api/ask/stream", json={"question": "any workouts?"})
        assert r.status_code == 429
        assert SOURCES_MARKER not in r.text   # never started the stream
