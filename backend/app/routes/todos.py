from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db, ReelDB, TodoDB
from app.routes.models.todo import (
    TodoResponse, TodoListResponse, CreateTodoRequest,
    CreateTodoFromReelRequest, UpdateTodoRequest,
)
from app.ratelimit import rate_limit
from app.auth import get_current_user, AuthUser

router = APIRouter(prefix="/api", tags=["todos"])

# A ceiling on rows one account can create. Not a product limit anyone should
# ever hit by hand — it's the backstop against a client loop filling the table,
# since this endpoint has no AI quota standing in front of it.
MAX_OPEN_TODOS = 500

# Ordering weight; the API speaks strings, sorting needs a rank.
_PRIORITY_RANK = {"high": 0, "medium": 1, "low": 2}


def _to_response(t: TodoDB) -> TodoResponse:
    return TodoResponse(
        id=t.id,
        reel_id=t.reel_id,
        title=t.title,
        description=t.description,
        priority=t.priority or "medium",
        due_date=t.due_date,
        completed=bool(t.completed),
        completed_at=t.completed_at,
        created_at=t.created_at,
    )


def _get_owned_todo_or_404(todo_id: str, user: AuthUser, db: Session) -> TodoDB:
    """404 (not 403) on someone else's id — same as reels, so an id probe can't
    distinguish 'not yours' from 'not there'."""
    todo = db.query(TodoDB).filter(TodoDB.id == todo_id, TodoDB.user_id == user.id).first()
    if not todo:
        raise HTTPException(status_code=404, detail="To-do not found")
    return todo


def _sort_key(t: TodoDB):
    """Dated items first (soonest first), then priority, then oldest-created.

    Sorted in Python, not SQL: `NULLS LAST` isn't portable across the SQLite dev
    DB and Postgres, and an open list is tens of rows.
    ponytail: fine to O(n log n) in memory; push into SQL if a user ever holds
    thousands of open todos.
    """
    return (
        t.due_date is None,                        # False (0) sorts before True (1)
        t.due_date or datetime.max.date(),
        _PRIORITY_RANK.get(t.priority or "medium", 1),
        t.created_at or datetime.min,
    )


def _summary_as_description(reel: ReelDB) -> str | None:
    """The reel's bullet summary flattened into the todo's description, so the
    todo still says what the save was about after the reel is gone."""
    summary = reel.summary if isinstance(reel.summary, list) else None
    if not summary:
        return None
    text = "\n".join(str(b).strip() for b in summary if str(b).strip())
    return text[:2000] or None


@router.get("/todos", response_model=TodoListResponse)
def list_todos(include_completed: bool = False,
               user: AuthUser = Depends(get_current_user), db: Session = Depends(get_db)):
    """The whole open list in one call — the client buckets it into
    overdue/today/upcoming/someday against the DEVICE's clock, because "today"
    is local and this server is UTC."""
    q = db.query(TodoDB).filter(TodoDB.user_id == user.id)
    if not include_completed:
        q = q.filter(TodoDB.completed == False)  # noqa: E712 — SQL, not Python truthiness
    items = sorted(q.all(), key=_sort_key)
    return TodoListResponse(total=len(items), items=[_to_response(t) for t in items])


@router.post("/todos", response_model=TodoResponse,
             dependencies=[Depends(rate_limit(60, 60, "todo_create"))])
def create_todo(body: CreateTodoRequest,
                user: AuthUser = Depends(get_current_user), db: Session = Depends(get_db)):
    _assert_under_cap(user, db)
    todo = TodoDB(
        user_id=user.id,
        title=body.title.strip(),
        description=(body.description or "").strip() or None,
        priority=body.priority,
        due_date=body.due_date,
    )
    db.add(todo)
    db.commit()
    db.refresh(todo)
    return _to_response(todo)


@router.post("/reels/{reel_id}/todo", response_model=TodoResponse,
             dependencies=[Depends(rate_limit(60, 60, "todo_create"))])
def create_todo_from_reel(reel_id: str, body: CreateTodoFromReelRequest,
                          user: AuthUser = Depends(get_current_user),
                          db: Session = Depends(get_db)):
    """Add-to-list from a save. Title and description are COPIED (not joined) so
    the todo stays readable if the reel is later deleted."""
    reel = db.query(ReelDB).filter(ReelDB.id == reel_id, ReelDB.user_id == user.id).first()
    if not reel:
        raise HTTPException(status_code=404, detail="Reel not found")
    _assert_under_cap(user, db)

    title = (body.title or reel.title or "Saved reel").strip()[:200]
    description = (body.description or "").strip() or _summary_as_description(reel)

    todo = TodoDB(
        user_id=user.id,
        reel_id=reel.id,
        title=title,
        description=description,
        priority=body.priority,
        due_date=body.due_date,
    )
    db.add(todo)
    db.commit()
    db.refresh(todo)
    return _to_response(todo)


@router.patch("/todos/{todo_id}", response_model=TodoResponse)
def update_todo(todo_id: str, body: UpdateTodoRequest,
                user: AuthUser = Depends(get_current_user), db: Session = Depends(get_db)):
    todo = _get_owned_todo_or_404(todo_id, user, db)

    if body.title is not None:
        todo.title = body.title.strip()
    if body.description is not None:
        todo.description = body.description.strip() or None
    if body.priority is not None:
        todo.priority = body.priority
    if body.clear_due_date:
        todo.due_date = None
    elif body.due_date is not None:
        todo.due_date = body.due_date

    if body.completed is not None and bool(todo.completed) != body.completed:
        todo.completed = body.completed
        # The timestamp is what the activity grid / streak reads. Cleared on
        # un-completing so an undo doesn't leave a phantom "done" day behind.
        todo.completed_at = datetime.utcnow() if body.completed else None

    db.commit()
    db.refresh(todo)
    return _to_response(todo)


@router.delete("/todos/{todo_id}")
def delete_todo(todo_id: str, user: AuthUser = Depends(get_current_user),
                db: Session = Depends(get_db)):
    todo = _get_owned_todo_or_404(todo_id, user, db)
    db.delete(todo)
    db.commit()
    return {"message": "Deleted"}


def _assert_under_cap(user: AuthUser, db: Session) -> None:
    open_count = (
        db.query(TodoDB)
        .filter(TodoDB.user_id == user.id, TodoDB.completed == False)  # noqa: E712
        .count()
    )
    if open_count >= MAX_OPEN_TODOS:
        raise HTTPException(
            status_code=429,
            detail=f"You have {MAX_OPEN_TODOS} open to-dos. Complete or delete a few before adding more.",
        )
