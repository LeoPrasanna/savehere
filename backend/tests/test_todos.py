"""DB-backed tests for the cross-reel to-do list.

Isolated in-memory SQLite (never touches the real DB) + an overridden
get_current_user so no JWT/Supabase call happens. Two users are seeded to prove
one can't read or mutate the other's list.

The load-bearing behaviours locked here:
  - a todo OUTLIVES its reel (unlink, not cascade) — deleting a save must never
    silently delete the user's plan;
  - completed_at is set/cleared with `completed` (it's what the activity grid reads);
  - priority is validated server-side (it drives ordering);
  - todos are swept on account deletion (they're owned by user_id, so the reel
    sweep alone would orphan them).
"""
import pytest
from datetime import datetime, timedelta, date
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, ReelDB, TodoDB, get_db
from app.auth import get_current_user, AuthUser
from app import ratelimit

USER_A = "user-aaaa"
USER_B = "user-bbbb"


def in_days(n: int) -> str:
    """A due date N days from today, as the client would send it.

    Relative on purpose: hardcoded calendar dates rot into *past* dates as real
    time passes, and past dates are now rejected — a fixed '2026-08-15' would
    turn this suite red on its own months from now, for no real reason.
    """
    return (datetime.utcnow().date() + timedelta(days=n)).isoformat()


@pytest.fixture
def ctx():
    """make_client(user_id) -> TestClient, plus a session factory for direct
    DB assertions. One in-memory DB shared by both users."""
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
               title="Perfect pasta recipe", summary=["Boil water", "Add salt"],
               tags=["cooking"], category="food", summary_status="ready",
               created_at=datetime.utcnow()),
        ReelDB(id="b1", user_id=USER_B, url="u-b1", platform="youtube",
               title="User B's reel", summary=["secret"], tags=[],
               category="food", summary_status="ready", created_at=datetime.utcnow()),
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
    # The per-IP limiter is a process global and TestClient always looks like one
    # IP — clear it so unrelated suite traffic can't 429 these tests.
    ratelimit._store.clear()

    def _make_client(user_id: str) -> TestClient:
        app.dependency_overrides[get_current_user] = lambda: AuthUser(id=user_id, email="t@e.co")
        return TestClient(app)

    yield _make_client, TestingSession
    app.dependency_overrides.clear()


@pytest.fixture
def client(ctx):
    make_client, _ = ctx
    return make_client(USER_A)


# ── Creating ────────────────────────────────────────────────────────────────

def test_create_standalone_needs_only_a_title(client):
    r = client.post("/api/todos", json={"title": "Call the plumber"})
    assert r.status_code == 200
    body = r.json()
    assert body["title"] == "Call the plumber"
    assert body["due_date"] is None          # date is optional by design
    assert body["priority"] == "medium"      # sane default
    assert body["completed"] is False
    assert body["reel_id"] is None


def test_create_accepts_optional_fields(client):
    r = client.post("/api/todos", json={
        "title": "Book flights",
        "description": "Before prices climb",
        "priority": "high",
        "due_date": in_days(15),
    })
    assert r.status_code == 200
    body = r.json()
    assert body["priority"] == "high"
    assert body["due_date"] == in_days(15)
    assert body["description"] == "Before prices climb"


@pytest.mark.parametrize("payload", [
    {"title": ""},                              # empty title
    {"title": "x", "priority": "urgent"},       # not one of high|medium|low
    {"title": "x", "due_date": "not-a-date"},
    {"description": "no title at all"},
])
def test_invalid_input_is_rejected(client, payload):
    assert client.post("/api/todos", json=payload).status_code == 422


# ── Adding from a reel ──────────────────────────────────────────────────────

def test_add_from_reel_copies_title_and_summary(client):
    r = client.post("/api/reels/a1/todo", json={"due_date": in_days(1)})
    assert r.status_code == 200
    body = r.json()
    assert body["reel_id"] == "a1"
    assert body["title"] == "Perfect pasta recipe"
    # Summary bullets are flattened into the description so the todo still reads
    # correctly once the reel is gone.
    assert "Boil water" in body["description"]
    assert "Add salt" in body["description"]


def test_add_from_reel_accepts_an_override_title(client):
    r = client.post("/api/reels/a1/todo", json={"title": "Cook pasta on Friday"})
    assert r.status_code == 200
    assert r.json()["title"] == "Cook pasta on Friday"


def test_cannot_add_from_someone_elses_reel(client):
    assert client.post("/api/reels/b1/todo", json={}).status_code == 404


# ── The reel/todo lifetime contract ─────────────────────────────────────────

def test_todo_survives_deleting_its_reel(ctx):
    make_client, Session = ctx
    client = make_client(USER_A)
    todo_id = client.post("/api/reels/a1/todo", json={}).json()["id"]

    assert client.delete("/api/reels/a1").status_code == 200

    items = client.get("/api/todos").json()["items"]
    assert len(items) == 1, "deleting the save must not delete the user's plan"
    assert items[0]["id"] == todo_id
    assert items[0]["reel_id"] is None          # link cleared, content intact
    assert items[0]["title"] == "Perfect pasta recipe"


# ── Completion ──────────────────────────────────────────────────────────────

def test_completing_stamps_completed_at_and_undo_clears_it(client):
    todo_id = client.post("/api/todos", json={"title": "Ship the thing"}).json()["id"]

    done = client.patch(f"/api/todos/{todo_id}", json={"completed": True}).json()
    assert done["completed"] is True
    assert done["completed_at"] is not None, "the activity grid reads this timestamp"

    undone = client.patch(f"/api/todos/{todo_id}", json={"completed": False}).json()
    assert undone["completed"] is False
    assert undone["completed_at"] is None, "an undo must not leave a phantom 'done' day"


def test_completed_items_are_hidden_unless_asked_for(client):
    todo_id = client.post("/api/todos", json={"title": "Done thing"}).json()["id"]
    client.patch(f"/api/todos/{todo_id}", json={"completed": True})

    assert client.get("/api/todos").json()["total"] == 0
    assert client.get("/api/todos?include_completed=true").json()["total"] == 1


def test_clear_due_date_moves_it_back_to_someday(client):
    todo_id = client.post(
        "/api/todos", json={"title": "Maybe later", "due_date": in_days(30)}
    ).json()["id"]

    r = client.patch(f"/api/todos/{todo_id}", json={"clear_due_date": True})
    assert r.json()["due_date"] is None


# ── Ordering ────────────────────────────────────────────────────────────────

def test_dated_items_come_first_then_priority(client):
    client.post("/api/todos", json={"title": "someday-high", "priority": "high"})
    client.post("/api/todos", json={"title": "later", "due_date": in_days(30)})
    client.post("/api/todos", json={"title": "soon-low", "due_date": in_days(2),
                                    "priority": "low"})
    client.post("/api/todos", json={"title": "soon-high", "due_date": in_days(2),
                                    "priority": "high"})

    titles = [t["title"] for t in client.get("/api/todos").json()["items"]]
    # Soonest date first; within a date, priority; undated ("Someday") last —
    # even when it's high priority.
    assert titles == ["soon-high", "soon-low", "later", "someday-high"]


# ── Isolation ───────────────────────────────────────────────────────────────

def test_one_user_cannot_see_or_touch_anothers_todos(ctx):
    make_client, _ = ctx
    a = make_client(USER_A)
    todo_id = a.post("/api/todos", json={"title": "A's private plan"}).json()["id"]

    b = make_client(USER_B)
    assert b.get("/api/todos").json()["total"] == 0
    # 404 (not 403) so an id probe can't distinguish "not yours" from "not there".
    assert b.patch(f"/api/todos/{todo_id}", json={"title": "hijacked"}).status_code == 404
    assert b.delete(f"/api/todos/{todo_id}").status_code == 404

    # …and A's todo is untouched. (make_client swaps one app-wide auth override,
    # so re-point it at A before asserting as A.)
    a = make_client(USER_A)
    assert a.get("/api/todos").json()["items"][0]["title"] == "A's private plan"


def test_unauthenticated_is_rejected(ctx):
    make_client, _ = ctx
    make_client(USER_A)
    app.dependency_overrides.pop(get_current_user)
    # No `with` — the lifespan/startup hook runs migrations against the REAL DB.
    anon = TestClient(app)
    assert anon.get("/api/todos").status_code == 401


# ── Past due dates ──────────────────────────────────────────────────────────

def test_past_due_date_is_rejected(client):
    r = client.post("/api/todos", json={"title": "Yesterday's problem", "due_date": in_days(-5)})
    assert r.status_code == 422
    assert "past" in r.json()["detail"].lower()


def test_past_due_date_is_rejected_when_adding_from_a_reel(client):
    r = client.post("/api/reels/a1/todo", json={"due_date": in_days(-5)})
    assert r.status_code == 422


def test_yesterday_is_accepted_as_timezone_slack(client):
    """NOT a loophole. A user in Honolulu (UTC-10) setting "today" sends a date
    that is already yesterday in UTC — rejecting it would break every
    negative-offset timezone. One day is the smallest window that can't produce
    a false rejection; the picker enforces the real rule on the device clock."""
    r = client.post("/api/todos", json={"title": "Late-night Honolulu", "due_date": in_days(-1)})
    assert r.status_code == 200


def test_editing_an_overdue_task_does_not_require_moving_its_date(ctx):
    """The client round-trips the existing due_date on every edit. If validation
    ran unconditionally, a task that had merely slipped past its date could never
    be renamed again."""
    make_client, Session = ctx
    client = make_client(USER_A)

    s = Session()
    try:
        s.add(TodoDB(id="old1", user_id=USER_A, title="Long overdue",
                     priority="medium", due_date=date.today() - timedelta(days=30)))
        s.commit()
    finally:
        s.close()

    r = client.patch("/api/todos/old1", json={
        "title": "Renamed but still overdue",
        "due_date": (date.today() - timedelta(days=30)).isoformat(),
    })
    assert r.status_code == 200
    assert r.json()["title"] == "Renamed but still overdue"


def test_moving_a_task_to_a_new_past_date_is_rejected(ctx):
    make_client, Session = ctx
    client = make_client(USER_A)
    s = Session()
    try:
        s.add(TodoDB(id="old2", user_id=USER_A, title="Overdue",
                     priority="medium", due_date=date.today() - timedelta(days=30)))
        s.commit()
    finally:
        s.close()

    assert client.patch("/api/todos/old2", json={"due_date": in_days(-9)}).status_code == 422


# ── Dashboard stats ─────────────────────────────────────────────────────────

def test_stats_count_the_whole_list_not_the_returned_page(client):
    a = client.post("/api/todos", json={"title": "one"}).json()["id"]
    client.post("/api/todos", json={"title": "two"})
    client.post("/api/todos", json={"title": "three"})
    client.patch(f"/api/todos/{a}", json={"completed": True})

    body = client.get("/api/todos").json()
    assert body["total"] == 2, "the default list hides completed items"
    # …but the stats describe everything, which is the point of a dashboard.
    assert body["stats"] == {"total": 3, "open": 2, "completed": 1}

    both = client.get("/api/todos?include_completed=true").json()
    assert both["total"] == 3
    assert both["stats"] == {"total": 3, "open": 2, "completed": 1}


# ── Per-reel lookup (drives the disabled "Add to to-do" button) ──────────────

def test_reel_todo_lookup_reports_the_open_one(client):
    none_yet = client.get("/api/reels/a1/todo").json()
    assert none_yet["open_todo"] is None and none_yet["completed_count"] == 0

    todo_id = client.post("/api/reels/a1/todo", json={"due_date": in_days(3)}).json()["id"]
    blocked = client.get("/api/reels/a1/todo").json()
    assert blocked["open_todo"]["id"] == todo_id, "button must show as already-added"

    # Completing it frees the button again — that's the whole re-activation rule.
    client.patch(f"/api/todos/{todo_id}", json={"completed": True})
    freed = client.get("/api/reels/a1/todo").json()
    assert freed["open_todo"] is None
    assert freed["completed_count"] == 1


def test_reel_todo_lookup_is_scoped_to_the_caller(ctx):
    make_client, _ = ctx
    a = make_client(USER_A)
    a.post("/api/reels/a1/todo", json={})

    b = make_client(USER_B)
    # B asking about A's reel learns nothing — no open todo, no existence signal.
    assert b.get("/api/reels/a1/todo").json()["open_todo"] is None


# ── Account deletion ────────────────────────────────────────────────────────

def test_account_deletion_removes_todos(ctx, monkeypatch):
    from app.routes import account
    # Don't touch the Supabase Admin API from a test.
    monkeypatch.setattr(account, "_delete_auth_user", lambda uid: True)

    make_client, Session = ctx
    a = make_client(USER_A)
    a.post("/api/todos", json={"title": "standalone, no reel"})
    a.post("/api/reels/a1/todo", json={})

    assert a.delete("/api/account").status_code == 200

    s = Session()
    try:
        # Owned by user_id, so the reel sweep alone would have orphaned these.
        assert s.query(TodoDB).filter(TodoDB.user_id == USER_A).count() == 0
    finally:
        s.close()
