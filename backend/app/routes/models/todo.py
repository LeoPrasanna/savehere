from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from datetime import date, datetime


# Validated by pydantic (422 on anything else) rather than trusted from the
# client — priority drives ordering, so junk here corrupts the whole list.
Priority = Literal["high", "medium", "low"]


class TodoResponse(BaseModel):
    id: str
    # null once the linked reel is deleted — the todo survives it, see TodoDB.
    reel_id: Optional[str]
    title: str
    description: Optional[str]
    priority: Priority
    due_date: Optional[date]        # null = "Someday"; a device-local calendar date
    completed: bool
    completed_at: Optional[datetime]
    created_at: Optional[datetime]


class TodoStats(BaseModel):
    """Whole-list counters for the dashboard header.

    Deliberately timezone-independent — no "due today"/"overdue" here. Those
    depend on the DEVICE's calendar day and are computed client-side from the
    list; returning a UTC-based version too would give the screen two
    disagreeing definitions of "today".
    """
    total: int
    open: int
    completed: int


class TodoListResponse(BaseModel):
    total: int                       # length of `items` (respects include_completed)
    items: List[TodoResponse]
    stats: TodoStats


class ReelTodoResponse(BaseModel):
    """What the reel screen needs to decide whether "Add to to-do" is available.
    `open_todo` is the incomplete one blocking the button (null = free to add)."""
    reel_id: str
    open_todo: Optional[TodoResponse]
    completed_count: int


class CreateTodoRequest(BaseModel):
    """A standalone todo typed by the user. Only the title is required —
    a date is deliberately optional so capture stays frictionless."""
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)
    priority: Priority = "medium"
    due_date: Optional[date] = None


class CreateTodoFromReelRequest(BaseModel):
    """Add-to-list from a save. Title/description default to the reel's own
    title + summary server-side, so the client can send just a date."""
    title: Optional[str] = Field(default=None, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)
    priority: Priority = "medium"
    due_date: Optional[date] = None


class UpdateTodoRequest(BaseModel):
    """Any field omitted is left unchanged."""
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)
    priority: Optional[Priority] = None
    due_date: Optional[date] = None
    completed: Optional[bool] = None
    # due_date is nullable, so "omitted" and "set to null" are indistinguishable
    # in the JSON. This flag is the explicit "move it back to Someday".
    clear_due_date: bool = False
