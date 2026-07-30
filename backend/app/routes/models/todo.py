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


class TodoListResponse(BaseModel):
    total: int
    items: List[TodoResponse]


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
