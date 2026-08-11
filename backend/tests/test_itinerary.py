"""Trip Itinerary endpoint (travel reels) + extractor normalization.

Locks: category gate, sensitive gate, per-reel cap, regeneration safety (a
failed regeneration never destroys an existing plan), quota-charge ordering,
and the defensive normalization of the model's JSON. No live AI anywhere.

Users here are in-trial (full access) — the Pro gate itself is locked by
test_feature_gating.py.
"""
import json
from types import SimpleNamespace

import pytest
from datetime import datetime
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, ReelDB, AiUsageDB, get_db
from app.auth import get_current_user, AuthUser
from app.routes import workout as workout_route
from app.routes.workout import SENSITIVE_DETAIL, ITINERARY_LIMIT
from app.services import workout_extractor as we

USER = "u-itin"

GOOD_PLAN = {
    "trip_name": "Bali Highlights",
    "destination": "Bali",
    "duration_days": 2,
    "structure_estimated": True,
    "days": [
        {"label": "Day 1", "items": [{"text": "Visit Uluwatu temple", "emoji": "🛕"}]},
        {"label": "Day 2", "items": [{"text": "Relax at Seminyak beach", "emoji": "🏖️"}]},
    ],
    "tips": ["Carry cash for temple entry"],
}


@pytest.fixture
def env():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    TestingSession = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    Base.metadata.create_all(bind=engine)

    db = TestingSession()
    db.add_all([
        ReelDB(id="trav1", user_id=USER, url="u-trav1", platform="instagram",
               category="travel", title="Bali in 2 days",
               raw_text="Visit Uluwatu temple then Seminyak beach. " * 5,
               summary_status="ready", created_at=datetime.utcnow()),
        ReelDB(id="cook1", user_id=USER, url="u-cook1", platform="instagram",
               category="cooking", title="Carbonara",
               raw_text="Boil pasta then mix eggs. " * 5,
               summary_status="ready", created_at=datetime.utcnow()),
        ReelDB(id="sens1", user_id=USER, url="u-sens1", platform="instagram",
               category="travel", title="Altitude sickness dosage guide",
               raw_text="Take this exact dosage at altitude. " * 5,
               is_sensitive=True, summary_status="ready", created_at=datetime.utcnow()),
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
    app.dependency_overrides[get_current_user] = lambda: AuthUser(id=USER, email="i@e.co")
    yield TestClient(app), TestingSession
    app.dependency_overrides.clear()


def _charges(Session) -> int:
    s = Session()
    try:
        return sum(r.count for r in s.query(AiUsageDB).filter(AiUsageDB.user_id == USER).all())
    finally:
        s.close()


class TestItineraryEndpoint:
    def test_generate_stores_and_counts(self, env, monkeypatch):
        client, Session = env
        monkeypatch.setattr(workout_route.workout_extractor, "extract_itinerary", lambda **kw: dict(GOOD_PLAN))

        res = client.post("/api/reels/trav1/itinerary")
        assert res.status_code == 200
        body = res.json()
        assert body["itinerary"]["trip_name"] == "Bali Highlights"
        assert body["regenerations_left"] == ITINERARY_LIMIT - 1
        assert _charges(Session) == 1

        # GET returns the stored plan without charging.
        got = client.get("/api/reels/trav1/itinerary").json()
        assert got["itinerary"]["destination"] == "Bali"
        assert _charges(Session) == 1

    def test_get_before_generation_is_null(self, env):
        client, _ = env
        body = client.get("/api/reels/trav1/itinerary").json()
        assert body["itinerary"] is None
        assert body["regenerations_left"] == ITINERARY_LIMIT

    def test_non_travel_category_refused(self, env, monkeypatch):
        client, Session = env
        monkeypatch.setattr(workout_route.workout_extractor, "extract_itinerary", lambda **kw: dict(GOOD_PLAN))
        res = client.post("/api/reels/cook1/itinerary")
        assert res.status_code == 422
        assert "travel" in res.json()["detail"].lower()
        assert _charges(Session) == 0

    def test_sensitive_reel_refused(self, env):
        client, Session = env
        res = client.post("/api/reels/sens1/itinerary")
        assert res.status_code == 422
        assert res.json()["detail"] == SENSITIVE_DETAIL
        assert _charges(Session) == 0

    def test_cap_returns_429_without_charging(self, env):
        client, Session = env
        s = Session()
        s.query(ReelDB).filter(ReelDB.id == "trav1").update({"itinerary_count": ITINERARY_LIMIT})
        s.commit()
        s.close()
        res = client.post("/api/reels/trav1/itinerary")
        assert res.status_code == 429
        assert _charges(Session) == 0

    def test_failed_regeneration_preserves_existing_plan(self, env, monkeypatch):
        client, Session = env
        monkeypatch.setattr(workout_route.workout_extractor, "extract_itinerary", lambda **kw: dict(GOOD_PLAN))
        assert client.post("/api/reels/trav1/itinerary").status_code == 200

        # Second run: model finds nothing. The 422 must not destroy the stored
        # plan and must not consume a regeneration. (It DOES charge the quota —
        # Claude genuinely ran; that honesty is asserted too.)
        monkeypatch.setattr(workout_route.workout_extractor, "extract_itinerary",
                            lambda **kw: {"trip_name": "Trip Plan", "destination": None,
                                          "duration_days": None, "structure_estimated": False,
                                          "days": [], "tips": []})
        res = client.post("/api/reels/trav1/itinerary")
        assert res.status_code == 422

        body = client.get("/api/reels/trav1/itinerary").json()
        assert body["itinerary"]["trip_name"] == "Bali Highlights"       # untouched
        assert body["regenerations_left"] == ITINERARY_LIMIT - 1          # only the success counted
        assert _charges(Session) == 2                                     # both Claude runs charged


# ── Extractor normalization (mock-based, mirrors test_workout_extractor) ───────

def _stub_client_raw(monkeypatch, text: str, stop_reason: str = "end_turn"):
    # stop_reason must be present: extract_itinerary checks it so a response cut
    # off at max_tokens becomes a loud retryable error instead of being parsed
    # into an empty plan and blamed on the user's reel.
    msg = SimpleNamespace(content=[SimpleNamespace(text=text)], stop_reason=stop_reason)
    monkeypatch.setattr(we.client, "messages", SimpleNamespace(create=lambda **kw: msg))


def _stub_client(monkeypatch, payload: dict):
    _stub_client_raw(monkeypatch, json.dumps(payload))


class TestExtractItineraryNormalization:
    def test_malformed_model_reply_degrades_to_empty(self, monkeypatch):
        _stub_client_raw(monkeypatch, "sorry, I can't produce JSON today")
        out = we.extract_itinerary(platform="instagram", title="Bali", text="x" * 60)
        assert out["days"] == []

    def test_junk_entries_dropped_and_labels_defaulted(self, monkeypatch):
        _stub_client(monkeypatch, {
            "trip_name": "Bali",
            "duration_days": "two",                      # wrong type → None
            "days": [
                {"label": "  ", "items": [
                    {"text": "Visit Uluwatu"},           # missing emoji → default
                    {"text": "   "},                     # blank → dropped
                    "junk",                              # not a dict → dropped
                    {"emoji": "🏖️"},                     # no text → dropped
                ]},
                "junk-day",                              # not a dict → dropped
                {"items": "not-a-list"},                 # bad items → dropped
            ],
            "tips": ["Carry cash", 42, "  "],
        })
        out = we.extract_itinerary(platform="instagram", title="Bali", text="x" * 60)
        assert out["days"] == [{"label": "Day 1", "items": [{"text": "Visit Uluwatu", "emoji": "📍"}]}]
        assert out["tips"] == ["Carry cash"]
        assert out["duration_days"] is None

    def test_oversized_reply_is_capped(self, monkeypatch):
        _stub_client(monkeypatch, {
            "trip_name": "Everywhere",
            "days": [{"label": f"Day {i+1}",
                      "items": [{"text": f"Stop {j}", "emoji": "📍"} for j in range(30)]}
                     for i in range(30)],
            "tips": [f"tip {i}" for i in range(30)],
        })
        out = we.extract_itinerary(platform="instagram", title="World tour", text="x" * 60)
        assert len(out["days"]) == 14
        assert all(len(d["items"]) == 10 for d in out["days"])
        assert len(out["tips"]) == 6

    def test_truncated_reply_raises_instead_of_returning_an_empty_plan(self, monkeypatch):
        """A response cut off at max_tokens is OUR budget bug, not a bad reel.

        Silently parsing the half-JSON into days=[] surfaced as a 422 telling the
        user their content had no trip details — after their AI action had
        already been charged. It must raise so the route can say 'try again'.
        """
        _stub_client_raw(monkeypatch, '{"trip_name": "Japan", "days": [{"lab',
                         stop_reason="max_tokens")
        with pytest.raises(RuntimeError):
            we.extract_itinerary(platform="instagram", title="10 days in Japan", text="x" * 60)
