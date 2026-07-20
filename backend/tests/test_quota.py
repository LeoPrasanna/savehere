"""Per-user daily AI quota (app/quota.py + the ai_usage table).

Unit tests exercise enforce_daily_ai_quota directly against an isolated in-memory
SQLite DB; one integration test proves the quota is actually wired into an AI route
(/api/ask) and returns a clean 429 once exhausted — without making a real Claude call.
"""
import pytest
from datetime import date
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.quota import enforce_daily_ai_quota, charge_ai_action, tier_for, daily_limit_for, _utc_today
from app.database import Base, AiUsageDB, get_db
from app.config import settings
from app.auth import get_current_user, AuthUser
from app.services import librarian

USER_A = "user-aaaa"
USER_B = "user-bbbb"


@pytest.fixture
def db():
    """An isolated in-memory session — the real savehere.db is never touched."""
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    s = Session()
    try:
        yield s
    finally:
        s.close()


def _count(db, user_id, day):
    row = db.query(AiUsageDB).filter(AiUsageDB.user_id == user_id, AiUsageDB.day == day).first()
    return row.count if row else 0


class TestQuotaHelper:
    def test_allows_up_to_limit_then_blocks(self, db):
        for expected in (1, 2, 3):
            assert enforce_daily_ai_quota(db, USER_A, limit=3) == expected
        with pytest.raises(HTTPException) as exc:
            enforce_daily_ai_quota(db, USER_A, limit=3)
        assert exc.value.status_code == 429

    def test_nothing_charged_on_rejection(self, db):
        # The quota keys rows on the UTC day — local date.today() diverges from
        # it for a window every day (e.g. 00:00–05:30 IST) and made this flake.
        enforce_daily_ai_quota(db, USER_A, limit=1)
        today = _utc_today()
        assert _count(db, USER_A, today) == 1
        with pytest.raises(HTTPException):
            enforce_daily_ai_quota(db, USER_A, limit=1)
        # The blocked call must not have incremented the counter.
        assert _count(db, USER_A, today) == 1

    def test_per_user_isolation(self, db):
        enforce_daily_ai_quota(db, USER_A, limit=1)
        with pytest.raises(HTTPException):
            enforce_daily_ai_quota(db, USER_A, limit=1)
        # USER_B has an independent budget.
        assert enforce_daily_ai_quota(db, USER_B, limit=1) == 1

    def test_resets_on_a_new_day(self, db):
        day1, day2 = date(2026, 1, 1), date(2026, 1, 2)
        for _ in range(3):
            enforce_daily_ai_quota(db, USER_A, limit=3, today=day1)
        with pytest.raises(HTTPException):
            enforce_daily_ai_quota(db, USER_A, limit=3, today=day1)
        # New day -> fresh allowance.
        assert enforce_daily_ai_quota(db, USER_A, limit=3, today=day2) == 1

    def test_uses_config_limit_by_default(self, db, monkeypatch):
        monkeypatch.setattr(settings, "AI_DAILY_LIMIT", 2)
        assert enforce_daily_ai_quota(db, USER_A) == 1
        assert enforce_daily_ai_quota(db, USER_A) == 2
        with pytest.raises(HTTPException):
            enforce_daily_ai_quota(db, USER_A)

    def test_zero_limit_blocks_even_the_first_action(self, db):
        # A limit of 0 is a hard kill-switch — the conditional UPDATE never fires.
        with pytest.raises(HTTPException) as exc:
            enforce_daily_ai_quota(db, USER_A, limit=0)
        assert exc.value.status_code == 429
        assert _count(db, USER_A, _utc_today()) == 0

    def test_increment_never_exceeds_limit(self, db):
        # The cap is enforced by a single conditional UPDATE (count < limit), so the
        # stored counter can never run past the limit no matter how many calls race in.
        for _ in range(10):
            try:
                enforce_daily_ai_quota(db, USER_A, limit=3)
            except HTTPException:
                pass
        assert _count(db, USER_A, _utc_today()) == 3


class TestTierResolution:
    """The daily limit is resolved from the JWT's server-set app_metadata.tier —
    the seam a RevenueCat/IAP webhook writes to. user_metadata must NOT count."""

    def test_defaults_to_free(self):
        assert tier_for(AuthUser(id="u")) == "free"

    def test_reads_pro_from_app_metadata(self):
        u = AuthUser(id="u", claims={"app_metadata": {"tier": "pro"}})
        assert tier_for(u) == "pro"

    def test_unknown_tier_falls_back_to_free(self):
        u = AuthUser(id="u", claims={"app_metadata": {"tier": "enterprise"}})
        assert tier_for(u) == "free"

    def test_user_metadata_tier_is_ignored(self):
        # user_metadata is user-editable — trusting it would let anyone self-upgrade.
        u = AuthUser(id="u", claims={"user_metadata": {"tier": "pro"}})
        assert tier_for(u) == "free"

    def test_limit_maps_to_tier(self, monkeypatch):
        monkeypatch.setattr(settings, "AI_DAILY_LIMIT", 30)
        monkeypatch.setattr(settings, "AI_PRO_DAILY_LIMIT", 200)
        assert daily_limit_for(AuthUser(id="u")) == 30
        assert daily_limit_for(AuthUser(id="u", claims={"app_metadata": {"tier": "pro"}})) == 200


class TestChargeAiActionUsesTierLimit:
    def test_pro_user_gets_the_higher_budget(self, db, monkeypatch):
        monkeypatch.setattr(settings, "AI_DAILY_LIMIT", 2)
        monkeypatch.setattr(settings, "AI_PRO_DAILY_LIMIT", 5)
        free = AuthUser(id="free-user")
        pro = AuthUser(id="pro-user", claims={"app_metadata": {"tier": "pro"}})

        # Free user is cut off at 2.
        charge_ai_action(db, free)
        charge_ai_action(db, free)
        with pytest.raises(HTTPException):
            charge_ai_action(db, free)

        # Pro user keeps going to 5 on an independent counter.
        for expected in (1, 2, 3, 4, 5):
            assert charge_ai_action(db, pro) == expected
        with pytest.raises(HTTPException):
            charge_ai_action(db, pro)


class TestQuotaWiredIntoAskRoute:
    """The quota must actually gate a live AI endpoint, per-user, with no real Claude call."""

    @pytest.fixture
    def make_client(self, monkeypatch):
        monkeypatch.setattr(settings, "AI_DAILY_LIMIT", 3)
        # These tests assert EXACT quota-429 semantics on /api/ask, but the
        # route also carries a per-IP burst limiter whose store is process-
        # global while TestClient presents a single IP — ask traffic from
        # earlier test files can spill in and 429 for the wrong reason. Start
        # from a clean bucket.
        from app.ratelimit import _store as _ip_store
        _ip_store.clear()
        # Stub the Claude call so the route never hits the network.
        monkeypatch.setattr(
            librarian, "ask_library",
            lambda q, payload: {"answer": "stub", "source_ids": []},
        )
        from app.main import app

        engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        Base.metadata.create_all(bind=engine)
        Session = sessionmaker(bind=engine, autocommit=False, autoflush=False)

        def _override_get_db():
            s = Session()
            try:
                yield s
            finally:
                s.close()

        app.dependency_overrides[get_db] = _override_get_db

        def _factory(user_id: str) -> TestClient:
            app.dependency_overrides[get_current_user] = lambda: AuthUser(id=user_id, email="t@e.co")
            return TestClient(app)

        yield _factory
        app.dependency_overrides.clear()

    def test_ask_blocks_after_daily_limit(self, make_client):
        client = make_client(USER_A)
        for _ in range(3):
            assert client.post("/api/ask", json={"question": "what did I save?"}).status_code == 200
        blocked = client.post("/api/ask", json={"question": "what did I save?"})
        assert blocked.status_code == 429
        assert "limit" in blocked.json()["detail"].lower()

    def test_quota_is_per_user(self, make_client):
        a = make_client(USER_A)
        for _ in range(3):
            a.post("/api/ask", json={"question": "mine?"})
        assert a.post("/api/ask", json={"question": "mine?"}).status_code == 429
        # A different user still has a full budget.
        assert make_client(USER_B).post("/api/ask", json={"question": "mine?"}).status_code == 200
