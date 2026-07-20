"""ai_action_log — the human-readable companion to the ai_usage counter.

Locks the contract that matters: logging is BEST-EFFORT. It rides along with
`charge_ai_action`, so it can never miss an AI action, and it can never break
one either — a log failure must not turn a working feature into a 500 or
refund a charge that really happened.
"""
import pytest
from datetime import date, datetime, timedelta
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, ReelDB, AiActionLogDB, AiUsageDB, get_db
from app.auth import get_current_user, AuthUser
from app.config import settings
from app import quota
from app.quota import charge_ai_action, log_ai_action, AI_LOG_RETENTION_DAYS, _utc_today
from app.routes import workout as workout_route

USER = "u-log"


@pytest.fixture
def env(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Session = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    Base.metadata.create_all(bind=engine)

    db = Session()
    db.add(ReelDB(id="fit1", user_id=USER, url="u-fit1", platform="instagram",
                  category="fitness", title="Chest Day Pump",
                  raw_text="Three sets of fifteen pushups then rest. " * 5,
                  summary_status="ready", created_at=datetime.utcnow()))
    db.commit()
    db.close()

    def _override_get_db():
        s = Session()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_current_user] = lambda: AuthUser(id=USER, email="l@e.co")
    monkeypatch.setattr(workout_route.workout_extractor, "extract_workout",
                        lambda **kw: {"workout_name": "W", "difficulty": "beginner",
                                      "estimated_minutes": 10,
                                      "exercises": [{"name": "Pushup", "type": "strength"}]})
    yield TestClient(app), Session
    app.dependency_overrides.clear()


def _rows(Session):
    s = Session()
    try:
        return s.query(AiActionLogDB).order_by(AiActionLogDB.created_at).all()
    finally:
        s.close()


class TestLoggingRidesAlongWithTheCharge:
    def test_workout_generation_is_logged_with_a_label(self, env):
        client, Session = env
        assert client.post("/api/reels/fit1/workout").status_code == 200
        rows = _rows(Session)
        assert len(rows) == 1
        assert rows[0].action == "workout"
        assert rows[0].label == "Chest Day Pump"      # the reel, not an opaque id
        assert rows[0].day == _utc_today()

    def test_refused_action_is_not_logged(self, env, monkeypatch):
        # Quota exhausted -> 429 before any Claude call. Nothing was spent, so
        # nothing may appear in the list.
        client, Session = env
        monkeypatch.setattr(settings, "AI_DAILY_LIMIT", 0)
        assert client.post("/api/reels/fit1/workout").status_code == 429
        assert _rows(Session) == []

    def test_log_failure_never_breaks_the_action(self, env, monkeypatch):
        """THE contract: the charge already succeeded and Claude is about to run.
        A logging bug at that point must be swallowed, not surfaced."""
        client, Session = env

        def boom(*a, **kw):
            raise RuntimeError("log table exploded")
        monkeypatch.setattr(quota, "log_ai_action", boom)

        res = client.post("/api/reels/fit1/workout")
        assert res.status_code == 200                 # feature still works
        s = Session()
        try:                                          # and the charge still stands
            assert s.query(AiUsageDB).filter(AiUsageDB.user_id == USER).one().count == 1
        finally:
            s.close()


class TestUsageLogEndpoint:
    def test_lists_todays_actions_newest_first(self, env):
        client, Session = env
        db = Session()
        try:
            log_ai_action(db, USER, "ask", "what did I save about Japan?")
            log_ai_action(db, USER, "recipe", "Carbonara")
        finally:
            db.close()

        body = client.get("/api/account/usage/log").json()
        assert body["day"] == _utc_today().isoformat()
        assert [i["action"] for i in body["items"]] == ["recipe", "ask"]
        assert body["items"][0]["action_label"] == "Recipe"
        assert body["items"][1]["label"] == "what did I save about Japan?"

    def test_only_the_callers_own_actions(self, env):
        client, Session = env
        db = Session()
        try:
            log_ai_action(db, USER, "ask", "mine")
            log_ai_action(db, "someone-else", "ask", "theirs")
        finally:
            db.close()
        items = client.get("/api/account/usage/log").json()["items"]
        assert [i["label"] for i in items] == ["mine"]

    def test_reports_used_alongside_logged(self, env):
        # Actions charged before this table existed still count on the meter but
        # can't be described — the response exposes both numbers so the client
        # can say "recent" instead of implying completeness.
        client, Session = env
        db = Session()
        try:
            db.add(AiUsageDB(user_id=USER, day=_utc_today(), count=5))
            db.commit()
            log_ai_action(db, USER, "ask", "only one described")
        finally:
            db.close()
        body = client.get("/api/account/usage/log").json()
        assert body["used"] == 5
        assert body["logged"] == 1


class TestRetention:
    def test_old_rows_are_pruned_on_write(self, env, monkeypatch):
        client, Session = env
        db = Session()
        try:
            stale = _utc_today() - timedelta(days=AI_LOG_RETENTION_DAYS + 1)
            db.add(AiActionLogDB(id="old", user_id=USER, day=stale, action="ask",
                                 label="ancient", created_at=datetime.utcnow()))
            db.commit()
        finally:
            db.close()

        monkeypatch.setattr(quota, "_last_prune_at", 0.0)   # force the throttle open
        db = Session()
        try:
            log_ai_action(db, USER, "ask", "fresh")
        finally:
            db.close()

        labels = [r.label for r in _rows(Session)]
        assert "ancient" not in labels
        assert "fresh" in labels

    def test_long_labels_are_truncated(self, env):
        client, Session = env
        db = Session()
        try:
            log_ai_action(db, USER, "ask", "x" * 500)
        finally:
            db.close()
        label = _rows(Session)[0].label
        assert len(label) <= 80 and label.endswith("…")


class TestAccountDeletionRemovesTheLog:
    def test_log_rows_go_with_the_account(self, env, monkeypatch):
        client, Session = env
        monkeypatch.setattr("app.routes.account._delete_auth_user", lambda uid: True)
        db = Session()
        try:
            log_ai_action(db, USER, "ask", "personal question text")
        finally:
            db.close()
        assert client.delete("/api/account").status_code == 200
        assert _rows(Session) == []
