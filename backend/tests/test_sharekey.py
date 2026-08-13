"""Share key — the credential the Android no-display share Activity carries.

A second way to authenticate is exactly the kind of thing that quietly grows a
hole, so the properties pinned here are the ones that would actually hurt:

  * the key is never stored in the clear;
  * it authenticates ONE route and no other;
  * a Pro user's silent share is entitled as Pro, not free;
  * a silent share charges the SAME daily AI bucket as a normal save.

The last two are the non-obvious ones. A share-key request carries no JWT, so
`app_metadata.tier` and the email claim that `quota_subject` hashes are both
absent — without the snapshots taken at mint time, a paying user would hit the
free save cap and silent shares would get their own private AI budget.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, ProfileDB, get_db
from app.auth import get_current_user, AuthUser
from app.quota import quota_subject
from app.entitlements import tier_for
from app.sharekey import mint_share_key, resolve_share_key, revoke_share_key
from app.routes import reels as reels_module

USER = "user-share"
EMAIL = "s@e.co"

FAKE_INFO = {
    "platform": "instagram",
    "title": "One-pan orzo",
    "caption": "",
    "transcript": "",
    "best_text": "Toast the orzo, add stock a ladle at a time, finish with lemon." * 3,
    "thumbnail_url": "https://scontent.cdninstagram.com/v/x.jpg",
    "uploader": "cook",
    "duration": 48,
    "needs_audio": False,
    "extracted": True,
}
FAKE_AI = {"summary": ["toast the orzo"], "tags": ["pasta"], "category": "cooking", "title": "One-pan orzo"}


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
    app.dependency_overrides[get_current_user] = lambda: AuthUser(id=USER, email=EMAIL)

    monkeypatch.setattr(reels_module, "SessionLocal", TestingSession)
    monkeypatch.setattr(reels_module.extractor, "extract_info", lambda url: dict(FAKE_INFO))
    monkeypatch.setattr(reels_module.summarizer, "summarize",
                        lambda platform, title, text, meta=None: dict(FAKE_AI))

    yield TestClient(app), TestingSession
    app.dependency_overrides.clear()


def _mint(client) -> str:
    r = client.post("/api/account/share-key")
    assert r.status_code == 200, r.text
    return r.json()["key"]


class TestMinting:
    def test_key_is_prefixed_and_only_its_hash_is_stored(self, env):
        client, Session = env
        key = _mint(client)
        assert key.startswith("shk_")
        # Enough entropy that guessing is not a threat model.
        assert len(key) > 40

        db = Session()
        profile = db.query(ProfileDB).filter(ProfileDB.user_id == USER).one()
        stored = profile.share_key_hash
        db.close()
        # THE point of hashing: a database leak must not yield a working
        # credential. The key must not appear anywhere in the row.
        assert stored and key not in stored
        assert len(stored) == 64          # sha256 hex

    def test_minting_again_supersedes_the_previous_key(self, env):
        client, Session = env
        first = _mint(client)
        second = _mint(client)
        assert first != second

        db = Session()
        assert resolve_share_key(db, second) is not None
        assert resolve_share_key(db, first) is None, "the superseded key must stop working"
        db.close()

    def test_revoke_kills_the_key(self, env):
        client, Session = env
        key = _mint(client)
        assert client.delete("/api/account/share-key").status_code == 200

        db = Session()
        assert resolve_share_key(db, key) is None
        db.close()

    def test_revoke_without_a_key_is_not_an_error(self, env):
        client, _ = env
        assert client.delete("/api/account/share-key").status_code == 200

    def test_garbage_never_resolves(self, env):
        client, Session = env
        _mint(client)
        db = Session()
        for bad in ("", "shk_", "shk_wrong", "not-a-key", "x" * 64):
            assert resolve_share_key(db, bad) is None, bad
        db.close()


class TestScope:
    """A stolen key must reach exactly one endpoint."""

    def test_share_save_accepts_the_key(self, env):
        client, _ = env
        key = _mint(client)
        # No Authorization header at all — this is the Activity's request.
        r = client.post(
            "/api/reels/share-save",
            json={"url": "https://www.instagram.com/reel/AAA111/"},
            headers={"X-Share-Key": key},
        )
        assert r.status_code == 200, r.text
        assert r.json()["url"]

    def test_share_save_refuses_a_missing_or_bad_key(self, env):
        client, _ = env
        _mint(client)
        url = {"url": "https://www.instagram.com/reel/BBB222/"}
        assert client.post("/api/reels/share-save", json=url).status_code == 401
        assert client.post("/api/reels/share-save", json=url,
                           headers={"X-Share-Key": "shk_nope"}).status_code == 401

    def test_the_key_authenticates_nothing_else(self, env):
        """The scoping property, asserted rather than asserted-in-a-comment.

        `get_current_user` is overridden in this fixture, so these routes would
        pass on the ambient identity — clearing the override is what makes the
        request genuinely unauthenticated apart from the share key.
        """
        client, _ = env
        key = _mint(client)
        app.dependency_overrides.pop(get_current_user)
        h = {"X-Share-Key": key}

        assert client.get("/api/reels", headers=h).status_code == 401
        assert client.get("/api/account/usage", headers=h).status_code == 401
        assert client.post("/api/ask", json={"question": "hi"}, headers=h).status_code == 401
        assert client.delete("/api/account", headers=h).status_code == 401
        # Not even the ordinary save route, which is the same work — the share
        # key is confined to its own URL on purpose.
        assert client.post("/api/reels/save",
                           json={"url": "https://www.instagram.com/reel/CCC333/"},
                           headers=h).status_code == 401


class TestSnapshots:
    def test_identity_matches_the_jwt_path(self, env):
        """A silent share must charge the SAME daily AI bucket as a normal save.

        `quota_subject` hashes the normalized email; a share-key request has no
        email claim, so without the stored subject it would fall back to
        `user_id` — a separate budget, i.e. share a reel to dodge the quota.
        """
        client, Session = env
        key = _mint(client)
        db = Session()
        user = resolve_share_key(db, key)
        db.close()

        assert user.id == USER
        assert quota_subject(user) == quota_subject(AuthUser(id=USER, email=EMAIL))

    def test_pro_tier_survives_the_hop(self, env):
        """Without the snapshot a paying user's silent share reads as free, and
        free carries a 20-save cap."""
        client, Session = env
        pro = AuthUser(id=USER, email=EMAIL, claims={"app_metadata": {"tier": "pro"}})
        app.dependency_overrides[get_current_user] = lambda: pro
        key = _mint(client)

        db = Session()
        resolved = resolve_share_key(db, key)
        db.close()
        assert tier_for(resolved) == "pro"

    def test_a_free_user_does_not_become_pro(self, env):
        client, Session = env
        key = _mint(client)                      # fixture user has no tier claim
        db = Session()
        resolved = resolve_share_key(db, key)
        db.close()
        assert tier_for(resolved) == "free"
