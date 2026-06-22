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
    notes: Optional[str]
    summarize_count: int
    tasks_count: int = 0
    workout_count: int = 0
    created_at: datetime

    class Config:
        from_attributes = True


class ReelListResponse(BaseModel):
    total: int
    items: list[ReelResponse]
