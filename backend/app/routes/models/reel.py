from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class ReelSaveRequest(BaseModel):
    url: str


class ReelNotesRequest(BaseModel):
    notes: str


class ReelCategoryRequest(BaseModel):
    category: str


class ReelResponse(BaseModel):
    id: str
    url: str
    platform: str
    title: Optional[str]
    thumbnail_url: Optional[str]
    uploader: Optional[str]
    duration: Optional[int]
    summary: list[str]
    tags: list[str]
    category: Optional[str]
    # pending | ready | skipped | failed — drives the "Summarizing…" UI state.
    summary_status: str = "ready"
    notes: Optional[str]
    summarize_count: int
    tasks_count: int = 0
    workout_count: int = 0
    # True when the summarizer flagged the content as medical/high-stakes advice —
    # the app shows a disclaimer and hides the tasks/workout actions.
    is_sensitive: bool = False
    created_at: datetime

    class Config:
        from_attributes = True


class ReelListResponse(BaseModel):
    total: int
    items: list[ReelResponse]
