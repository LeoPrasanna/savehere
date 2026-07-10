"""Regression tests for the reliability/tier revamp:

- deleting a reel removes its tasks and workout exercises (no orphans)
- deleting an account removes reels + all children but keeps ai_usage
  (so wiping data can't reset the daily AI quota)
- GET /api/account/usage reports tier/used/limit without charging
- the thumbnail proxy rejects look-alike hosts (SSRF guard)

Same isolation pattern as test_search_api.py: in-memory SQLite + auth override.
"""
import pytest
from datetime import datetime
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, ReelDB, TaskDB, WorkoutExerciseDB, AiUsageDB, get_db
from app.auth import get_current_user, AuthUser

USER_A = "user-aaaa"
USER_B = "user-bbbb"


@pytest.fixture
def env():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSession = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    Base.metadata.create_all(bind=engine)

    db = TestingSession()
    db.add_all([
        ReelDB(id="a1", user_id=USER_A, url="u-a1", platform="youtube",
               title="Pasta recipe", summary=["s"], tags=["cooking"],
               summary_status="ready", created_at=datetime.utcnow()),
        ReelDB(id="a2", user_id=USER_A, url="u-a2", platform="instagram",
               title="Leg day", summary=["s"], tags=["fitness"],
               summary_status="ready", created_at=datetime.utcnow()),
        ReelDB(id="b1", user_id=USER_B, url="u-b1", platform="youtube",
               title="B's reel", summary=["s"], tags=[],
               summary_status="ready", created_at=datetime.utcnow()),
        TaskDB(id="t1", reel_id="a1", text="boil water"),
        TaskDB(id="t2", reel_id="a1", text="add salt"),
        TaskDB(id="t3", reel_id="b1", text="b's task"),
        WorkoutExerciseDB(id="w1", reel_id="a2", name="Squat"),
        AiUsageDB(user_id=USER_A, day=datetime.utcnow().date(), count=5),
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

    def _client(user_id: str) -> TestClient:
        app.dependency_overrides[get_current_user] = lambda: AuthUser(id=user_id, email="t@e.co")
        return TestClient(app)

    yield _client, TestingSession
    app.dependency_overrides.clear()


class TestCascadeDelete:
    def test_deleting_reel_removes_children(self, env):
        client, Session = env
        r = client(USER_A).delete("/api/reels/a1")
        assert r.status_code == 200
        db = Session()
        try:
            assert db.query(TaskDB).filter(TaskDB.reel_id == "a1").count() == 0
            # other users' rows untouched
            assert db.query(TaskDB).filter(TaskDB.reel_id == "b1").count() == 1
        finally:
            db.close()


class TestAccountDeletion:
    def test_removes_reels_tasks_exercises_keeps_quota(self, env, monkeypatch):
        from app.routes import account as account_module
        deleted_ids = []
        monkeypatch.setattr(account_module, "_delete_auth_user",
                            lambda uid: deleted_ids.append(uid) or True)
        client, Session = env
        r = client(USER_A).delete("/api/account")
        assert r.status_code == 200
        assert r.json()["reels_removed"] == 2
        assert r.json()["auth_deleted"] is True
        # the Supabase auth record is deleted for the right user
        assert deleted_ids == [USER_A]
        db = Session()
        try:
            assert db.query(ReelDB).filter(ReelDB.user_id == USER_A).count() == 0
            assert db.query(TaskDB).filter(TaskDB.reel_id.in_(["a1", "a2"])).count() == 0
            assert db.query(WorkoutExerciseDB).count() == 0
            # USER_B untouched
            assert db.query(ReelDB).filter(ReelDB.user_id == USER_B).count() == 1
            assert db.query(TaskDB).filter(TaskDB.reel_id == "b1").count() == 1
            # quota history survives — deleting data must not reset the daily budget
            assert db.query(AiUsageDB).filter(AiUsageDB.user_id == USER_A).count() == 1
        finally:
            db.close()

    def test_no_trailing_slash_needed(self, env, monkeypatch):
        from app.routes import account as account_module
        monkeypatch.setattr(account_module, "_delete_auth_user", lambda uid: True)
        client, _ = env
        # DELETE /api/account must work directly (307 redirects can drop auth headers)
        r = client(USER_B).delete("/api/account")
        assert r.status_code == 200

    def test_auth_deletion_failure_reported_honestly(self, env, monkeypatch):
        """Data wipe succeeds but the auth record can't be removed → the response
        must say so instead of claiming the account is gone."""
        from app.routes import account as account_module
        monkeypatch.setattr(account_module, "_delete_auth_user", lambda uid: False)
        client, _ = env
        r = client(USER_A).delete("/api/account")
        assert r.status_code == 200
        body = r.json()
        assert body["deleted"] is True
        assert body["auth_deleted"] is False
        assert "contact support" in body["message"]

    def test_delete_auth_user_handles_http_errors(self, monkeypatch):
        """The admin call must never raise — a Supabase outage can't 500 the wipe."""
        from app.routes.account import _delete_auth_user
        import httpx

        class FakeResp:
            status_code = 500
        monkeypatch.setattr(httpx, "delete", lambda *a, **k: FakeResp())
        assert _delete_auth_user("u1") is False

        def boom(*a, **k):
            raise httpx.ConnectError("no network")
        monkeypatch.setattr(httpx, "delete", boom)
        assert _delete_auth_user("u1") is False


class TestUsageEndpoint:
    def test_reports_tier_used_limit_without_charging(self, env):
        client, Session = env
        c = client(USER_A)
        body = c.get("/api/account/usage").json()
        assert body["tier"] == "free"
        assert body["used"] == 5
        assert body["limit"] >= body["used"]
        assert body["remaining"] == body["limit"] - 5
        # read again — still 5: the endpoint never charges
        assert c.get("/api/account/usage").json()["used"] == 5

    def test_zero_usage_user(self, env):
        client, _ = env
        body = client(USER_B).get("/api/account/usage").json()
        assert body["used"] == 0
        assert body["remaining"] == body["limit"]


class TestThumbnailProxyHostGuard:
    @pytest.mark.parametrize("url", [
        "https://ytimg.com.evil.example/x.jpg",       # suffix look-alike
        "https://evilytimg.com/x.jpg",                # prefix look-alike
        "https://internal.local/x.jpg",               # not on the list
        "http://i.ytimg.com/x.jpg",                   # plain http refused
    ])
    def test_rejects_bad_hosts(self, env, url):
        client, _ = env
        r = client(USER_A).get("/api/thumbnail", params={"url": url})
        assert r.status_code == 400
