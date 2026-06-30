"""DB-backed tests for the library list/search endpoints (pagination + server-side
search) AND per-user isolation. Uses an isolated in-memory SQLite so the real
savehere.db is never touched, and overrides get_current_user so no real JWT/Supabase
call happens. Seeds two users to prove one can't see the other's reels."""
import pytest
from datetime import datetime, timedelta
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, ReelDB, get_db
from app.auth import get_current_user, AuthUser

USER_A = "user-aaaa"
USER_B = "user-bbbb"


@pytest.fixture
def make_client():
    """Returns a factory: make_client(user_id) -> TestClient authenticated as that user,
    sharing one in-memory DB seeded with reels for both USER_A and USER_B."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSession = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    Base.metadata.create_all(bind=engine)

    db = TestingSession()
    base = datetime.utcnow()
    db.add_all([
        # USER_A's reels
        ReelDB(id="a1", user_id=USER_A, url="u-a1", platform="youtube",
               title="Perfect pasta recipe", summary=["boil water", "add salt"],
               tags=["cooking", "italian"], notes="my kitchen notes", category="food",
               summary_status="ready", created_at=base - timedelta(minutes=1)),
        ReelDB(id="a2", user_id=USER_A, url="u-a2", platform="instagram",
               title="Morning workout", summary=["10 pushups"], tags=["fitness"],
               notes=None, category="fitness", summary_status="ready",
               created_at=base - timedelta(minutes=2)),
        ReelDB(id="a3", user_id=USER_A, url="u-a3", platform="tiktok",
               title="Budgeting tips", summary=["track spending"],
               tags=["finance", "money"], notes=None, category="finance",
               summary_status="pending", created_at=base - timedelta(minutes=3)),
        # USER_B's reel — must never surface for USER_A
        ReelDB(id="b1", user_id=USER_B, url="u-b1", platform="youtube",
               title="Secret pasta of user B", summary=["secret"], tags=["cooking"],
               notes="private", category="food", summary_status="ready",
               created_at=base - timedelta(minutes=1)),
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
    """Convenience: a client authenticated as USER_A."""
    return make_client(USER_A)


class TestListPagination:
    def test_total_is_full_count_regardless_of_limit(self, client):
        body = client.get("/api/reels?limit=2&offset=0").json()
        assert body["total"] == 3        # USER_A has 3 (USER_B's not counted)
        assert len(body["items"]) == 2

    def test_offset_returns_next_page(self, client):
        page1 = client.get("/api/reels?limit=2&offset=0").json()["items"]
        page2 = client.get("/api/reels?limit=2&offset=2").json()["items"]
        assert len(page2) == 1
        ids = {i["id"] for i in page1} | {i["id"] for i in page2}
        assert ids == {"a1", "a2", "a3"}

    def test_newest_first(self, client):
        items = client.get("/api/reels").json()["items"]
        assert [i["id"] for i in items] == ["a1", "a2", "a3"]

    def test_platform_filter(self, client):
        body = client.get("/api/reels?platform=instagram").json()
        assert body["total"] == 1
        assert body["items"][0]["id"] == "a2"


class TestSearch:
    def test_matches_title(self, client):
        body = client.get("/api/reels/search?q=pasta").json()
        assert body["total"] == 1
        assert body["items"][0]["id"] == "a1"   # NOT user B's "Secret pasta"

    def test_matches_tag(self, client):
        body = client.get("/api/reels/search?q=finance").json()
        assert {i["id"] for i in body["items"]} == {"a3"}

    def test_matches_summary_text(self, client):
        assert client.get("/api/reels/search?q=pushups").json()["items"][0]["id"] == "a2"

    def test_matches_notes(self, client):
        assert client.get("/api/reels/search?q=kitchen").json()["items"][0]["id"] == "a1"

    def test_case_insensitive(self, client):
        assert client.get("/api/reels/search?q=PASTA").json()["total"] == 1

    def test_empty_query_returns_nothing(self, client):
        assert client.get("/api/reels/search?q=").json() == {"total": 0, "items": []}

    def test_no_match_is_empty(self, client):
        assert client.get("/api/reels/search?q=zzzznope").json()["total"] == 0


class TestPerUserIsolation:
    def test_list_only_shows_own_reels(self, make_client):
        a = make_client(USER_A).get("/api/reels").json()
        b = make_client(USER_B).get("/api/reels").json()
        assert a["total"] == 3 and {i["id"] for i in a["items"]} == {"a1", "a2", "a3"}
        assert b["total"] == 1 and {i["id"] for i in b["items"]} == {"b1"}

    def test_cannot_get_another_users_reel(self, make_client):
        # USER_A asking for USER_B's reel id -> 404 (not 403, no existence leak).
        assert make_client(USER_A).get("/api/reels/b1").status_code == 404
        # And USER_B can fetch their own.
        assert make_client(USER_B).get("/api/reels/b1").status_code == 200

    def test_cannot_delete_another_users_reel(self, make_client):
        assert make_client(USER_A).delete("/api/reels/b1").status_code == 404
        # B's reel still there afterwards.
        assert make_client(USER_B).get("/api/reels/b1").status_code == 200

    def test_search_does_not_cross_users(self, make_client):
        # "pasta" exists for both A (Perfect pasta) and B (Secret pasta).
        a = make_client(USER_A).get("/api/reels/search?q=pasta").json()
        assert {i["id"] for i in a["items"]} == {"a1"}

    def test_unauthenticated_request_is_401(self, make_client):
        # Clear the auth override -> the real dependency rejects the missing token.
        make_client(USER_A)  # sets up overrides + db
        app.dependency_overrides.pop(get_current_user, None)
        assert TestClient(app).get("/api/reels").status_code == 401
