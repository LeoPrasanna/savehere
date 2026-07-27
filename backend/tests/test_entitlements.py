"""Tier system tests — the full matrix from the design review:

- effective tiers: pro / in-trial / expired (trickle)
- trial clock is server-side and starts on first touch
- trial continuity across re-signup (email-hash grant): +tags, gmail dots, case
- referral seam: trial_extra_days extends the window
- post-trial save cap: blocks new saves, never dedup; deleting re-opens
- post-trial AI trickle: N charges then 429; mid-day tier flips behave
- usage endpoint exposes tier / trial_ends_at / saves / ai
- account deletion removes the profile but keeps the trial grant
"""
import pytest
from datetime import datetime, timedelta
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, ReelDB, ProfileDB, TrialGrantDB, get_db
from app.auth import get_current_user, AuthUser
from app.entitlements import entitlements_for, normalize_email
from app.quota import charge_ai_action
from fastapi import HTTPException

NOW = datetime(2026, 7, 10, 12, 0, 0)


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

    def _client(user: AuthUser) -> TestClient:
        app.dependency_overrides[get_current_user] = lambda: user
        return TestClient(app)

    yield _client, TestingSession
    app.dependency_overrides.clear()


def _backdate_trial(Session, user_id: str, days: int):
    """Force a user's trial to have started `days` ago."""
    db = Session()
    try:
        p = db.query(ProfileDB).filter(ProfileDB.user_id == user_id).first()
        p.trial_started_at = datetime.utcnow() - timedelta(days=days)
        db.commit()
    finally:
        db.close()


def _seed_reels(Session, user_id: str, n: int):
    db = Session()
    try:
        for i in range(n):
            db.add(ReelDB(id=f"{user_id}-r{i}", user_id=user_id, url=f"u-{user_id}-{i}",
                          platform="youtube", summary_status="ready"))
        db.commit()
    finally:
        db.close()


class TestEffectiveTier:
    def test_new_user_is_in_trial(self, env):
        _, Session = env
        db = Session()
        try:
            ent = entitlements_for(AuthUser(id="u-new", email="a@b.co"), db)
            assert ent.tier == "trial"
            assert ent.save_limit is None
            assert ent.ai_daily_limit == 10
            assert ent.trial_ends_at is not None
        finally:
            db.close()

    def test_expired_trial_becomes_free_with_trickle_and_cap(self, env):
        _, Session = env
        db = Session()
        try:
            user = AuthUser(id="u-old", email="old@b.co")
            entitlements_for(user, db)          # creates profile
        finally:
            db.close()
        _backdate_trial(Session, "u-old", days=11)
        db = Session()
        try:
            ent = entitlements_for(AuthUser(id="u-old", email="old@b.co"), db)
            assert ent.tier == "free"
            assert ent.ai_daily_limit == 3      # the trickle
            assert ent.save_limit == 20
        finally:
            db.close()

    def test_pro_skips_trial_math_entirely(self, env):
        _, Session = env
        db = Session()
        try:
            pro = AuthUser(id="u-pro", email="p@b.co", claims={"app_metadata": {"tier": "pro"}})
            ent = entitlements_for(pro, db)
            assert ent.tier == "pro"
            assert ent.ai_daily_limit == 20
            assert ent.save_limit is None
            assert ent.trial_ends_at is None
            # pro never creates a profile row (no trial clock needed)
            assert db.query(ProfileDB).filter(ProfileDB.user_id == "u-pro").first() is None
        finally:
            db.close()

    def test_referral_seam_extends_trial(self, env):
        _, Session = env
        db = Session()
        try:
            user = AuthUser(id="u-ref", email="r@b.co")
            entitlements_for(user, db)
        finally:
            db.close()
        _backdate_trial(Session, "u-ref", days=11)
        db = Session()
        try:
            p = db.query(ProfileDB).filter(ProfileDB.user_id == "u-ref").first()
            p.trial_extra_days = 5              # 11 days in, 10+5 window → still trialing
            db.commit()
            ent = entitlements_for(AuthUser(id="u-ref", email="r@b.co"), db)
            assert ent.tier == "trial"
        finally:
            db.close()


class TestTrialContinuity:
    def test_email_normalization(self):
        assert normalize_email("Foo+trial2@GMAIL.com") == "foo@gmail.com"
        assert normalize_email("f.o.o@googlemail.com") == "foo@gmail.com"
        assert normalize_email("user+x@proton.me") == "user@proton.me"
        assert normalize_email("dotted.name@proton.me") == "dotted.name@proton.me"  # dots only collapsed for gmail

    def test_resignup_inherits_original_trial_clock(self, env):
        """Delete account → sign up again with an alias → NOT a fresh trial."""
        _, Session = env
        db = Session()
        try:
            entitlements_for(AuthUser(id="u-v1", email="cycle@gmail.com"), db)
        finally:
            db.close()
        # Age the original grant beyond the trial window.
        db = Session()
        try:
            g = db.query(TrialGrantDB).first()
            g.trial_started_at = datetime.utcnow() - timedelta(days=30)
            p = db.query(ProfileDB).filter(ProfileDB.user_id == "u-v1").first()
            db.delete(p)                        # simulate account deletion
            db.commit()
        finally:
            db.close()
        # "New" account, same human: gmail dots + plus-tag alias.
        db = Session()
        try:
            ent = entitlements_for(AuthUser(id="u-v2", email="c.y.c.l.e+again@gmail.com"), db)
            assert ent.tier == "free"           # inherited the 30-day-old clock
        finally:
            db.close()

    def test_genuinely_new_email_gets_fresh_trial(self, env):
        _, Session = env
        db = Session()
        try:
            entitlements_for(AuthUser(id="u-a", email="one@b.co"), db)
            ent = entitlements_for(AuthUser(id="u-b", email="two@b.co"), db)
            assert ent.tier == "trial"
        finally:
            db.close()


class TestSaveCap:
    def test_expired_user_at_cap_cannot_save(self, env, monkeypatch):
        client, Session = env
        user = AuthUser(id="u-cap", email="cap@b.co")
        c = client(user)
        c.get("/api/account/usage")             # touch → create profile
        _backdate_trial(Session, "u-cap", days=11)
        _seed_reels(Session, "u-cap", 20)
        r = c.post("/api/reels/save", json={"url": "https://youtube.com/shorts/newone123"})
        assert r.status_code == 403
        assert "full" in r.json()["detail"]

    def test_deleting_below_cap_reopens_saving(self, env, monkeypatch):
        client, Session = env
        from app.routes import reels as reels_module
        monkeypatch.setattr(reels_module, "SessionLocal", Session)
        monkeypatch.setattr(reels_module.extractor, "extract_info",
                            lambda url: {"platform": "youtube", "title": "t", "best_text": "",
                                         "thumbnail_url": "x", "uploader": "", "duration": 10,
                                         "needs_audio": False, "extracted": True, "caption": "", "transcript": ""})
        user = AuthUser(id="u-cap2", email="cap2@b.co")
        c = client(user)
        c.get("/api/account/usage")
        _backdate_trial(Session, "u-cap2", days=11)
        _seed_reels(Session, "u-cap2", 20)
        assert c.post("/api/reels/save", json={"url": "https://youtube.com/shorts/blocked1"}).status_code == 403
        assert c.delete("/api/reels/u-cap2-r0").status_code == 200
        assert c.post("/api/reels/save", json={"url": "https://youtube.com/shorts/allowed1"}).status_code == 200

    def test_trial_and_pro_users_uncapped(self, env, monkeypatch):
        client, Session = env
        from app.routes import reels as reels_module
        monkeypatch.setattr(reels_module, "SessionLocal", Session)
        monkeypatch.setattr(reels_module.extractor, "extract_info",
                            lambda url: {"platform": "youtube", "title": "t", "best_text": "",
                                         "thumbnail_url": "x", "uploader": "", "duration": 10,
                                         "needs_audio": False, "extracted": True, "caption": "", "transcript": ""})
        trial_user = AuthUser(id="u-trial", email="tr@b.co")
        _seed_reels(Session, "u-trial", 25)     # over the free cap, but in trial
        c = client(trial_user)
        assert c.post("/api/reels/save", json={"url": "https://youtube.com/shorts/trialok1"}).status_code == 200

        pro = AuthUser(id="u-pro2", email="p2@b.co", claims={"app_metadata": {"tier": "pro"}})
        _seed_reels(Session, "u-pro2", 25)
        assert client(pro).post("/api/reels/save", json={"url": "https://youtube.com/shorts/prook1"}).status_code == 200

    def test_dedup_wins_over_cap(self, env):
        """Re-saving an already-saved link returns the existing card even at cap."""
        client, Session = env
        user = AuthUser(id="u-dd", email="dd@b.co")
        c = client(user)
        c.get("/api/account/usage")
        _backdate_trial(Session, "u-dd", days=11)
        _seed_reels(Session, "u-dd", 20)
        db = Session()
        try:
            existing_url = db.query(ReelDB).filter(ReelDB.user_id == "u-dd").first().url
        finally:
            db.close()
        r = c.post("/api/reels/save", json={"url": existing_url})
        assert r.status_code == 200             # not 403


class TestTrickleQuota:
    def test_three_then_429(self, env):
        _, Session = env
        user = AuthUser(id="u-trickle", email="tk@b.co")
        db = Session()
        try:
            entitlements_for(user, db)
        finally:
            db.close()
        _backdate_trial(Session, "u-trickle", days=11)
        db = Session()
        try:
            for i in range(3):
                charge_ai_action(db, user)      # 1..3 OK
            with pytest.raises(HTTPException) as exc:
                charge_ai_action(db, user)      # 4th refused
            assert exc.value.status_code == 429
        finally:
            db.close()

    def test_upgrade_mid_day_raises_ceiling(self, env):
        """Burn the trickle, get stamped pro → charges flow again immediately."""
        _, Session = env
        db = Session()
        try:
            free_user = AuthUser(id="u-flip", email="fl@b.co")
            entitlements_for(free_user, db)
        finally:
            db.close()
        _backdate_trial(Session, "u-flip", days=11)
        db = Session()
        try:
            free_user = AuthUser(id="u-flip", email="fl@b.co")
            for _ in range(3):
                charge_ai_action(db, free_user)
            with pytest.raises(HTTPException):
                charge_ai_action(db, free_user)
            pro_user = AuthUser(id="u-flip", email="fl@b.co", claims={"app_metadata": {"tier": "pro"}})
            assert charge_ai_action(db, pro_user) == 4   # count continues, ceiling lifted
        finally:
            db.close()

    def test_downgrade_mid_day_blocks_over_limit(self, env):
        """Pro burns its full cap → token flips to free (expired trial) → next charge refused."""
        _, Session = env
        db = Session()
        try:
            pro = AuthUser(id="u-down", email="dn@b.co", claims={"app_metadata": {"tier": "pro"}})
            for _ in range(20):
                charge_ai_action(db, pro)
            free = AuthUser(id="u-down", email="dn@b.co")
            entitlements_for(free, db)
        finally:
            db.close()
        _backdate_trial(Session, "u-down", days=11)
        db = Session()
        try:
            free = AuthUser(id="u-down", email="dn@b.co")
            with pytest.raises(HTTPException) as exc:
                charge_ai_action(db, free)       # 20 >= 3
            assert exc.value.status_code == 429
        finally:
            db.close()


class TestUsageEndpoint:
    def test_trial_shape(self, env):
        client, _ = env
        body = client(AuthUser(id="u-shape", email="s@b.co")).get("/api/account/usage").json()
        assert body["tier"] == "trial"
        assert body["trial_ends_at"] is not None
        assert body["saves"] == {"used": 0, "limit": None}
        assert body["limit"] == 10 and body["remaining"] == 10

    def test_expired_shape(self, env):
        client, Session = env
        c = client(AuthUser(id="u-shape2", email="s2@b.co"))
        c.get("/api/account/usage")
        _backdate_trial(Session, "u-shape2", days=11)
        _seed_reels(Session, "u-shape2", 5)
        body = c.get("/api/account/usage").json()
        assert body["tier"] == "free"
        assert body["saves"] == {"used": 5, "limit": 20}
        assert body["limit"] == 3

    def test_pro_shape(self, env):
        client, _ = env
        pro = AuthUser(id="u-shape3", email="s3@b.co", claims={"app_metadata": {"tier": "pro"}})
        body = client(pro).get("/api/account/usage").json()
        assert body["tier"] == "pro"
        assert body["trial_ends_at"] is None
        assert body["saves"]["limit"] is None

    def test_library_counts_are_whole_library_distinct(self, env):
        """categories/platforms count DISTINCT values across the whole library —
        the client used to derive these from a page sample and undercounted."""
        client, Session = env
        db = Session()
        try:
            for i, (cat, plat) in enumerate([
                ("fitness", "youtube"), ("fitness", "instagram"),
                ("travel", "tiktok"), (None, "youtube"),  # null category ignored
            ]):
                db.add(ReelDB(id=f"lc{i}", user_id="u-lc", url=f"u{i}",
                              platform=plat, category=cat, summary_status="ready"))
            db.commit()
        finally:
            db.close()
        body = client(AuthUser(id="u-lc", email="lc@b.co")).get("/api/account/usage").json()
        assert body["saves"]["used"] == 4
        assert body["categories"] == 2   # fitness, travel (null not counted)
        assert body["platforms"] == 3    # youtube, instagram, tiktok


class TestAccountDeletionInteraction:
    def test_profile_deleted_grant_survives(self, env, monkeypatch):
        from app.routes import account as account_module
        monkeypatch.setattr(account_module, "_delete_auth_user", lambda uid: True)
        client, Session = env
        user = AuthUser(id="u-del", email="del@gmail.com")
        c = client(user)
        c.get("/api/account/usage")             # creates profile + grant
        assert c.delete("/api/account").status_code == 200
        db = Session()
        try:
            assert db.query(ProfileDB).filter(ProfileDB.user_id == "u-del").first() is None
            assert db.query(TrialGrantDB).count() == 1   # the anti-abuse record stays
        finally:
            db.close()
