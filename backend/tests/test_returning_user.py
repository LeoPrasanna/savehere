"""`returning` on GET /api/account/usage — "has this email been here before?"

The signal is DERIVED, not stored: `_ensure_profile` seeds a new profile's
`trial_started_at` from an existing `trial_grants` row when one matches the hash
of the user's email, and that row deliberately survives account deletion (it is
what stops trial-reset farming). So a profile whose trial clock predates its own
creation is one that inherited someone's — i.e. this person deleted an account
and came back.

These cases exist because the alternative — a `returning` column plus a
migration — would have been a second source of truth for something the existing
rows already imply.
"""
import pytest
from datetime import datetime, timedelta
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, ProfileDB, get_db
from app.auth import get_current_user, AuthUser
from app.routes.account import _is_returning

USER = "user-returning"


@pytest.fixture
def db_session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                           poolclass=StaticPool)
    TestingSession = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    Base.metadata.create_all(bind=engine)
    session = TestingSession()

    def _override_get_db():
        s = TestingSession()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_current_user] = lambda: AuthUser(id=USER, email="t@e.co")
    yield session
    session.close()
    app.dependency_overrides.clear()


def _profile(db, *, started_days_ago: float, created_days_ago: float):
    now = datetime.utcnow()
    db.add(ProfileDB(
        user_id=USER,
        trial_started_at=now - timedelta(days=started_days_ago),
        trial_extra_days=0,
        created_at=now - timedelta(days=created_days_ago),
    ))
    db.commit()


class TestIsReturning:
    def test_a_brand_new_profile_is_not_returning(self, db_session):
        """Both timestamps are written from the same `now`, so the gap is zero."""
        _profile(db_session, started_days_ago=0, created_days_ago=0)
        assert _is_returning(AuthUser(id=USER, email="t@e.co"), db_session) is False

    def test_an_inherited_clock_means_returning(self, db_session):
        """The profile was created today but carries a trial that began 40 days
        ago — only `_ensure_profile`'s trial_grants lookup does that."""
        _profile(db_session, started_days_ago=40, created_days_ago=0)
        assert _is_returning(AuthUser(id=USER, email="t@e.co"), db_session) is True

    def test_a_few_seconds_of_clock_skew_is_not_a_return(self, db_session):
        """⚠️ The two columns are written by separate statements. Without slack,
        ordinary write ordering would tell a first-time user "welcome back"."""
        now = datetime.utcnow()
        db_session.add(ProfileDB(
            user_id=USER,
            trial_started_at=now - timedelta(seconds=3),
            trial_extra_days=0,
            created_at=now,
        ))
        db_session.commit()
        assert _is_returning(AuthUser(id=USER, email="t@e.co"), db_session) is False

    def test_no_profile_yet_is_not_returning(self, db_session):
        """Never guess a return for someone we know nothing about — the honest
        default is 'new'."""
        assert _is_returning(AuthUser(id=USER, email="t@e.co"), db_session) is False

    def test_null_timestamps_do_not_explode(self, db_session):
        """Rows predating either column must not 500 the whole usage endpoint,
        which every meter in the app depends on."""
        db_session.add(ProfileDB(user_id=USER, trial_started_at=datetime.utcnow(),
                                 trial_extra_days=0, created_at=None))
        db_session.commit()
        assert _is_returning(AuthUser(id=USER, email="t@e.co"), db_session) is False


class TestUsageEndpointExposesIt:
    def test_returning_true_reaches_the_client(self, db_session):
        _profile(db_session, started_days_ago=40, created_days_ago=0)
        body = TestClient(app).get("/api/account/usage").json()
        assert body["returning"] is True

    def test_returning_false_for_a_new_account(self, db_session):
        _profile(db_session, started_days_ago=0, created_days_ago=0)
        body = TestClient(app).get("/api/account/usage").json()
        assert body["returning"] is False
