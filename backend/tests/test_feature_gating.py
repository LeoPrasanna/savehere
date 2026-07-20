"""Feature gating (decided 2026-07-20): post-trial free keeps saves/library/
summaries + workout & recipe (cooking-category tasks); Ask-my-Library,
non-cooking tasks, and Trip Itinerary are Pro-only. Trial keeps FULL access.

Enforced server-side with 403s — the app's locked buttons are cosmetic; these
tests are the lock. Core property: a refused call must never charge the quota.
No live AI: every extractor/librarian call is stubbed.
"""
import pytest
from datetime import datetime, timedelta
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, ReelDB, ProfileDB, AiUsageDB, get_db
from app.auth import get_current_user, AuthUser
from app.ratelimit import _store as _ip_store
from app.routes import ask as ask_route
from app.routes import workout as workout_route

FREE, TRIAL, PRO = "u-free", "u-trial", "u-pro"


@pytest.fixture
def env(monkeypatch):
    # The per-IP burst limiter is process-global and TestClient always presents
    # one IP — clear it so this file neither inherits another file's traffic nor
    # leaks its own into later tests (e.g. test_quota's exact-429 assertions).
    _ip_store.clear()
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    TestingSession = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    Base.metadata.create_all(bind=engine)

    db = TestingSession()
    # Expired trial (started 30d ago, TRIAL_DAYS=10) → effective FREE tier.
    db.add(ProfileDB(user_id=FREE, trial_started_at=datetime.utcnow() - timedelta(days=30)))
    # One reel per relevant category per user so every route has a target.
    for uid in (FREE, TRIAL, PRO):
        db.add_all([
            ReelDB(id=f"{uid}-travel", user_id=uid, url=f"{uid}-t", platform="instagram",
                   category="travel", title="Bali in 5 days",
                   raw_text="Visit Uluwatu temple then Seminyak beach. " * 5,
                   summary_status="ready"),
            ReelDB(id=f"{uid}-cook", user_id=uid, url=f"{uid}-c", platform="instagram",
                   category="cooking", title="Carbonara",
                   raw_text="Boil pasta then mix eggs and cheese. " * 5,
                   summary_status="ready"),
            ReelDB(id=f"{uid}-tech", user_id=uid, url=f"{uid}-x", platform="youtube",
                   category="tech", title="Set up Docker",
                   raw_text="Install docker then run compose up. " * 5,
                   summary_status="ready"),
            ReelDB(id=f"{uid}-fit", user_id=uid, url=f"{uid}-f", platform="instagram",
                   category="fitness", title="Chest day",
                   raw_text="Three sets of fifteen pushups then rest. " * 5,
                   summary_status="ready"),
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

    # Stub every AI call the gated routes can reach.
    monkeypatch.setattr(workout_route.workout_extractor, "extract_tasks",
                        lambda **kw: {"kind": "tasks", "source": "content", "needs_input": False,
                                      "tasks": [{"text": "Do it", "emoji": "✅"}]})
    monkeypatch.setattr(workout_route.workout_extractor, "extract_workout",
                        lambda **kw: {"workout_name": "W", "difficulty": "beginner",
                                      "estimated_minutes": 10,
                                      "exercises": [{"name": "Pushup", "type": "strength"}]})
    monkeypatch.setattr(workout_route.workout_extractor, "extract_itinerary",
                        lambda **kw: {"trip_name": "T", "destination": "Bali", "duration_days": 1,
                                      "structure_estimated": False, "tips": [],
                                      "days": [{"label": "Day 1",
                                                "items": [{"text": "Visit Uluwatu", "emoji": "📍"}]}]})
    monkeypatch.setattr(ask_route.librarian, "ask_library",
                        lambda q, payload: {"answer": "from your saves", "source_ids": []})
    monkeypatch.setattr(ask_route.librarian, "stream_answer", lambda q, payload: iter(["from ", "saves"]))
    monkeypatch.setattr(ask_route.librarian, "sources_from_answer", lambda answer, payload: [])

    def _client(user_id: str, tier_claim: str | None = None) -> TestClient:
        claims = {"app_metadata": {"tier": tier_claim}} if tier_claim else {}
        app.dependency_overrides[get_current_user] = (
            lambda: AuthUser(id=user_id, email=f"{user_id}@e.co", claims=claims)
        )
        return TestClient(app)

    def _charges(user_id: str) -> int:
        s = TestingSession()
        try:
            return sum(r.count for r in s.query(AiUsageDB).filter(AiUsageDB.user_id == user_id).all())
        finally:
            s.close()

    yield _client, _charges
    app.dependency_overrides.clear()
    _ip_store.clear()


class TestFreeTierLocks:
    def test_ask_is_pro_only_and_never_charges(self, env):
        client, charges = env
        res = client(FREE).post("/api/ask", json={"question": "what did I save about Bali?"})
        assert res.status_code == 403
        assert "Pro" in res.json()["detail"]
        assert charges(FREE) == 0

    def test_ask_stream_is_pro_only(self, env):
        client, charges = env
        res = client(FREE).post("/api/ask/stream", json={"question": "what did I save about Bali?"})
        assert res.status_code == 403
        assert charges(FREE) == 0

    def test_tasks_on_non_cooking_is_pro_only(self, env):
        client, charges = env
        res = client(FREE).post(f"/api/reels/{FREE}-tech/tasks")
        assert res.status_code == 403
        assert "Pro" in res.json()["detail"]
        assert charges(FREE) == 0

    def test_itinerary_is_pro_only(self, env):
        client, charges = env
        res = client(FREE).post(f"/api/reels/{FREE}-travel/itinerary")
        assert res.status_code == 403
        assert "Pro" in res.json()["detail"]
        assert charges(FREE) == 0


class TestFreeTierKeeps:
    def test_recipe_stays_free(self, env):
        # Cooking-category tasks ARE the recipe feature — free keeps it.
        client, charges = env
        res = client(FREE).post(f"/api/reels/{FREE}-cook/tasks")
        assert res.status_code == 200
        assert charges(FREE) == 1   # allowed call charges normally

    def test_workout_stays_free(self, env):
        client, charges = env
        res = client(FREE).post(f"/api/reels/{FREE}-fit/workout")
        assert res.status_code == 200
        assert charges(FREE) == 1


class TestTrialAndProKeepFullAccess:
    def test_trial_has_full_access(self, env):
        client, _ = env
        c = client(TRIAL)   # fresh profile → in-trial
        assert c.post("/api/ask", json={"question": "what did I save?"}).status_code == 200
        assert c.post(f"/api/reels/{TRIAL}-tech/tasks").status_code == 200
        assert c.post(f"/api/reels/{TRIAL}-travel/itinerary").status_code == 200

    def test_pro_has_full_access(self, env):
        client, _ = env
        c = client(PRO, tier_claim="pro")
        assert c.post("/api/ask", json={"question": "what did I save?"}).status_code == 200
        assert c.post(f"/api/reels/{PRO}-travel/itinerary").status_code == 200


class TestUsageExposesFeatureFlags:
    def test_free_flags_all_locked(self, env):
        client, _ = env
        feats = client(FREE).get("/api/account/usage").json()["features"]
        assert feats == {"ask": False, "tasks": False, "itinerary": False}

    def test_trial_flags_all_open(self, env):
        client, _ = env
        feats = client(TRIAL).get("/api/account/usage").json()["features"]
        assert feats == {"ask": True, "tasks": True, "itinerary": True}

    def test_pro_flags_all_open(self, env):
        client, _ = env
        feats = client(PRO, tier_claim="pro").get("/api/account/usage").json()["features"]
        assert feats == {"ask": True, "tasks": True, "itinerary": True}
