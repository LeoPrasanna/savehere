"""`POST /api/reels/{id}/thumbnail` — re-resolve a dead or missing preview image.

⚠️ The bug this locks down was MEASURED, not reported in the abstract. A scan of
153 saved reels found TWO separate causes behind "sometimes the thumbnail is not
loading":

  * 26 rows with no `thumbnail_url` at all — extraction failed at save time.
  * 6 rows holding an Instagram CDN URL whose `oe=` expiry had ALREADY PASSED
    (saved 2026-07-20, expired 2026-07-25 — about five days).

The second class grows with the age of the library and no client-side retry can
touch it, which is why the symptom read as intermittent. YouTube is immune
(`i.ytimg.com` links are unsigned), so the bug is Instagram-shaped, not random.

Mock-based throughout: a test that reached Instagram would pass on a laptop and
fail in CI, which is the standing rule in TODO.md.
"""
import pytest
from unittest.mock import patch
from datetime import datetime
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, ReelDB, get_db
from app.auth import get_current_user, AuthUser
from app.routes import reels as reels_routes

USER_A = "user-aaaa"
USER_B = "user-bbbb"

IG_URL = "https://www.instagram.com/reel/ABC123/"
EXPIRED = "https://scontent.cdninstagram.com/old.jpg?oe=60000000"
FRESH = "https://scontent.cdninstagram.com/new.jpg?oe=99999999"


@pytest.fixture
def make_client():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                           poolclass=StaticPool)
    TestingSession = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    Base.metadata.create_all(bind=engine)

    db = TestingSession()
    db.add_all([
        # The expired-signed-URL class.
        ReelDB(id="expired", user_id=USER_A, url=IG_URL, platform="instagram",
               title="Expired thumb", summary=[], tags=[], summary_status="ready",
               thumbnail_url=EXPIRED, created_at=datetime.utcnow()),
        # The never-had-one class.
        ReelDB(id="missing", user_id=USER_A, url=IG_URL, platform="instagram",
               title="No thumb", summary=[], tags=[], summary_status="ready",
               thumbnail_url=None, created_at=datetime.utcnow()),
        # Someone else's.
        ReelDB(id="theirs", user_id=USER_B, url=IG_URL, platform="instagram",
               title="Not yours", summary=[], tags=[], summary_status="ready",
               thumbnail_url=EXPIRED, created_at=datetime.utcnow()),
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

    def _factory(user_id: str) -> TestClient:
        app.dependency_overrides[get_current_user] = lambda: AuthUser(id=user_id, email="t@e.co")
        return TestClient(app)

    yield _factory
    app.dependency_overrides.clear()


@pytest.fixture
def client(make_client):
    return make_client(USER_A)


class TestResolveThumbnail:
    """Per-platform routing. Getting this wrong fails silently — the endpoint
    still 422s, it just 422s for a reel that could have been repaired."""

    def test_instagram_uses_the_embed_route(self):
        with patch.object(reels_routes.extractor, "instagram_embed",
                          return_value={"image": FRESH}) as m:
            assert reels_routes._resolve_thumbnail(IG_URL, "instagram") == FRESH
        m.assert_called_once()

    def test_youtube_is_derived_not_fetched(self):
        """`i.ytimg.com` URLs are unsigned and cannot expire, so there is nothing
        to re-resolve — deriving it costs no network call at all."""
        with patch.object(reels_routes.extractor, "_extract_from_page") as page, \
             patch.object(reels_routes.extractor, "instagram_embed") as ig:
            got = reels_routes._resolve_thumbnail(
                "https://www.youtube.com/shorts/xyz789ABCD", "youtube")
        assert got == "https://i.ytimg.com/vi/xyz789ABCD/hqdefault.jpg"
        page.assert_not_called()
        ig.assert_not_called()

    def test_other_platforms_fall_back_to_the_page(self):
        with patch.object(reels_routes.extractor, "_extract_from_page",
                          return_value={"image": "https://media.licdn.com/x.jpg"}) as m:
            got = reels_routes._resolve_thumbnail("https://www.linkedin.com/posts/x", "linkedin")
        assert got == "https://media.licdn.com/x.jpg"
        m.assert_called_once()

    @pytest.mark.parametrize("payload", [{}, None, {"image": None}, {"image": ""}])
    def test_nothing_found_is_an_empty_string_never_none(self, payload):
        """Callers branch on truthiness and then compare to the stored value; a
        None leaking through would be a 500 over a picture."""
        with patch.object(reels_routes.extractor, "instagram_embed", return_value=payload):
            assert reels_routes._resolve_thumbnail(IG_URL, "instagram") == ""


class TestRefreshEndpoint:
    def test_replaces_an_expired_url_and_persists_it(self, client):
        with patch.object(reels_routes.extractor, "instagram_embed",
                          return_value={"image": FRESH}):
            r = client.post("/api/reels/expired/thumbnail")
        assert r.status_code == 200
        assert r.json()["thumbnail_url"] == FRESH
        # Persisted, not merely echoed — the next list call must serve the new one.
        assert client.get("/api/reels/expired").json()["thumbnail_url"] == FRESH

    def test_fills_in_a_reel_that_never_had_one(self, client):
        with patch.object(reels_routes.extractor, "instagram_embed",
                          return_value={"image": FRESH}):
            r = client.post("/api/reels/missing/thumbnail")
        assert r.status_code == 200
        assert r.json()["thumbnail_url"] == FRESH

    def test_nothing_available_is_a_clean_422_not_a_500(self, client):
        """A private or deleted post is an expected outcome, not an error state:
        it must read as a sentence, never a stack trace (quality bar #1)."""
        with patch.object(reels_routes.extractor, "instagram_embed", return_value={}):
            r = client.post("/api/reels/expired/thumbnail")
        assert r.status_code == 422
        assert "private or deleted" in r.json()["detail"]

    def test_extractor_blowing_up_is_contained(self, client):
        """A network wobble must not 500; the user sees the same honest 422."""
        with patch.object(reels_routes.extractor, "instagram_embed",
                          side_effect=RuntimeError("connection reset")):
            r = client.post("/api/reels/expired/thumbnail")
        assert r.status_code == 422

    def test_costs_no_ai_action(self, client):
        """⚠️ THE LOAD-BEARING ONE. A stale picture is our data going bad, not
        something the user asked an AI for — charging their daily allowance to
        repair it would be billing them for our problem. If anyone ever routes
        this through `charge_ai_action`, this test fails."""
        with patch.object(reels_routes, "charge_ai_action") as charge, \
             patch.object(reels_routes.extractor, "instagram_embed",
                          return_value={"image": FRESH}):
            assert client.post("/api/reels/expired/thumbnail").status_code == 200
        charge.assert_not_called()

    def test_another_users_reel_is_404(self, make_client):
        """Same ownership rule as every other single-reel route: 404, not 403 —
        the existence of someone else's id is not ours to confirm."""
        with patch.object(reels_routes.extractor, "instagram_embed",
                          return_value={"image": FRESH}):
            r = make_client(USER_A).post("/api/reels/theirs/thumbnail")
        assert r.status_code == 404

    def test_unknown_reel_is_404(self, client):
        with patch.object(reels_routes.extractor, "instagram_embed",
                          return_value={"image": FRESH}):
            assert client.post("/api/reels/nope/thumbnail").status_code == 404
