"""DB-backed tests for the library list/search endpoints (the pagination + server-
side search added with infinite scroll). Uses an isolated in-memory SQLite so the
real savehere.db is never touched."""
import pytest
from datetime import datetime, timedelta
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, ReelDB, get_db


@pytest.fixture
def client():
    # Fresh in-memory DB per test. StaticPool keeps the single connection alive so
    # the schema created here is the same one the request sees.
    from sqlalchemy.pool import StaticPool
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSession = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    Base.metadata.create_all(bind=engine)

    def _seed():
        db = TestingSession()
        base = datetime.utcnow()
        rows = [
            ReelDB(id="1", url="u1", platform="youtube", title="Perfect pasta recipe",
                   summary=["boil water", "add salt"], tags=["cooking", "italian"],
                   notes="my kitchen notes", category="food", summary_status="ready",
                   created_at=base - timedelta(minutes=1)),
            ReelDB(id="2", url="u2", platform="instagram", title="Morning workout",
                   summary=["10 pushups"], tags=["fitness"], notes=None,
                   category="fitness", summary_status="ready",
                   created_at=base - timedelta(minutes=2)),
            ReelDB(id="3", url="u3", platform="tiktok", title="Budgeting tips",
                   summary=["track spending"], tags=["finance", "money"], notes=None,
                   category="finance", summary_status="pending",
                   created_at=base - timedelta(minutes=3)),
        ]
        db.add_all(rows)
        db.commit()
        db.close()

    _seed()

    def _override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


class TestListPagination:
    def test_total_is_full_count_regardless_of_limit(self, client):
        r = client.get("/api/reels?limit=2&offset=0")
        body = r.json()
        assert body["total"] == 3        # full count
        assert len(body["items"]) == 2   # one page

    def test_offset_returns_next_page(self, client):
        page1 = client.get("/api/reels?limit=2&offset=0").json()["items"]
        page2 = client.get("/api/reels?limit=2&offset=2").json()["items"]
        assert len(page2) == 1
        ids = {i["id"] for i in page1} | {i["id"] for i in page2}
        assert ids == {"1", "2", "3"}    # no overlap, full coverage

    def test_newest_first(self, client):
        items = client.get("/api/reels").json()["items"]
        assert [i["id"] for i in items] == ["1", "2", "3"]

    def test_platform_filter(self, client):
        body = client.get("/api/reels?platform=instagram").json()
        assert body["total"] == 1
        assert body["items"][0]["id"] == "2"


class TestSearch:
    def test_matches_title(self, client):
        body = client.get("/api/reels/search?q=pasta").json()
        assert body["total"] == 1
        assert body["items"][0]["id"] == "1"

    def test_matches_tag(self, client):
        body = client.get("/api/reels/search?q=finance").json()
        assert {i["id"] for i in body["items"]} == {"3"}

    def test_matches_summary_text(self, client):
        body = client.get("/api/reels/search?q=pushups").json()
        assert body["items"][0]["id"] == "2"

    def test_matches_notes(self, client):
        body = client.get("/api/reels/search?q=kitchen").json()
        assert body["items"][0]["id"] == "1"

    def test_case_insensitive(self, client):
        assert client.get("/api/reels/search?q=PASTA").json()["total"] == 1

    def test_empty_query_returns_nothing(self, client):
        body = client.get("/api/reels/search?q=").json()
        assert body == {"total": 0, "items": []}

    def test_no_match_is_empty(self, client):
        assert client.get("/api/reels/search?q=zzzznope").json()["total"] == 0
