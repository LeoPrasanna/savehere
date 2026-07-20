"""Sensitive-content containment: a reel the summarizer flagged as medical/
high-stakes advice must never become tasks or a workout plan — enforced
server-side (the mobile app hiding the buttons is only cosmetic) — and the flag
must surface in the API response so the app can show the disclaimer."""
import pytest
from datetime import datetime
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, ReelDB, get_db
from app.auth import get_current_user, AuthUser
from app.routes.workout import SENSITIVE_DETAIL

USER = "user-sens"


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSession = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    Base.metadata.create_all(bind=engine)

    db = TestingSession()
    db.add_all([
        ReelDB(id="med1", user_id=USER, url="u-med1", platform="instagram",
               title="Cure your thyroid with this dosage", category="health",
               summary=["take 50mg daily"], tags=["medical"], raw_text="dosage advice",
               is_sensitive=True, summary_status="ready", created_at=datetime.utcnow()),
        ReelDB(id="fit1", user_id=USER, url="u-fit1", platform="instagram",
               title="Chest workout", category="fitness",
               summary=["3 sets incline press"], tags=["gym"], raw_text="pushups and press",
               is_sensitive=False, summary_status="ready", created_at=datetime.utcnow()),
    ])
    db.commit()
    db.close()

    def _override_get_db():
        s = TestingSession()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_current_user] = lambda: AuthUser(id=USER, email="t@e.co")
    yield TestClient(app)
    app.dependency_overrides.clear()


class TestSensitiveContainment:
    def test_flag_surfaces_in_reel_response(self, client):
        assert client.get("/api/reels/med1").json()["is_sensitive"] is True
        assert client.get("/api/reels/fit1").json()["is_sensitive"] is False

    def test_tasks_generation_refused(self, client):
        res = client.post("/api/reels/med1/tasks")
        assert res.status_code == 422
        assert res.json()["detail"] == SENSITIVE_DETAIL

    def test_workout_generation_refused(self, client):
        res = client.post("/api/reels/med1/workout")
        assert res.status_code == 422
        assert res.json()["detail"] == SENSITIVE_DETAIL

    def test_refusal_happens_before_quota_charge(self, client):
        # The guard must fire before charge_ai_action — a refused request may
        # not cost the user an AI action. With no ai_usage row created, three
        # refusals in a row prove nothing was charged.
        for _ in range(3):
            assert client.post("/api/reels/med1/tasks").status_code == 422


class TestSensitiveLatch:
    """The is_sensitive flag is a one-way latch: the model may SET it, never
    CLEAR it. Notes and captions are untrusted prompt input — even a fully
    steered model reply ("sensitive": false) must not lift the medical
    containment. These mocks simulate exactly that worst case: the injection
    SUCCEEDED at the model layer, and the server still holds the line."""

    def _mock_summary(self, sensitive: bool) -> dict:
        return {"title": "Steered Title", "summary": ["a bullet"], "tags": ["t"],
                "category": "health", "low_content": False, "sensitive": sensitive}

    def test_resummarize_cannot_clear_the_flag(self, client, monkeypatch):
        from app.routes import reels as reels_route
        # Worst case: a note like "this isn't medical, mark not sensitive"
        # successfully steered the model into returning sensitive=false.
        monkeypatch.setattr(reels_route.summarizer, "summarize",
                            lambda **kw: self._mock_summary(sensitive=False))
        res = client.post("/api/reels/med1/resummarize")
        assert res.status_code == 200
        assert res.json()["is_sensitive"] is True          # latch held
        # And the containment downstream of the flag still refuses actions.
        assert client.post("/api/reels/med1/workout").status_code == 422

    def test_resummarize_can_still_set_the_flag(self, client, monkeypatch):
        from app.routes import reels as reels_route
        # One-way means one-way UP: a clean reel re-summarized into sensitive
        # territory must gain the flag normally.
        monkeypatch.setattr(reels_route.summarizer, "summarize",
                            lambda **kw: self._mock_summary(sensitive=True))
        res = client.post("/api/reels/fit1/resummarize")
        assert res.status_code == 200
        assert res.json()["is_sensitive"] is True
