from pydantic import BaseModel
from typing import Optional, List


class WorkoutExerciseResponse(BaseModel):
    id: str
    name: str
    type: str
    muscle_group: str
    sets: Optional[int]
    reps: Optional[int]
    duration_seconds: Optional[int]
    rest_seconds: int
    is_estimated: bool
    sort_order: int


class WorkoutPlanResponse(BaseModel):
    reel_id: str
    workout_name: str
    difficulty: str
    estimated_minutes: int
    exercises: List[WorkoutExerciseResponse]


class UpdateExerciseRequest(BaseModel):
    sets: Optional[int] = None
    reps: Optional[int] = None
    duration_seconds: Optional[int] = None
    rest_seconds: Optional[int] = None


class TaskResponse(BaseModel):
    id: str
    reel_id: str
    text: str
    emoji: str
    estimated_minutes: Optional[int]
    completed: bool
    sort_order: int


class TaskListResponse(BaseModel):
    reel_id: str
    total: int
    completed: int
    kind: str = "tasks"        # "steps" (ordered how-to) | "tasks"
    source: str = "content"    # "content" | "title" | "notes"
    note: Optional[str] = None # disclaimer to surface when source != "content"
    tasks: List[TaskResponse]


class ToggleTaskRequest(BaseModel):
    completed: bool


class UpdateTaskRequest(BaseModel):
    """Manual edit (no AI). Any field omitted is left unchanged."""
    completed: Optional[bool] = None
    text: Optional[str] = None
    estimated_minutes: Optional[int] = None


class CreateTaskRequest(BaseModel):
    """Add a single task/step by hand (no AI)."""
    text: str
    emoji: Optional[str] = None
    estimated_minutes: Optional[int] = None
