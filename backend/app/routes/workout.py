from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import uuid
from datetime import datetime

from app.database import get_db, ReelDB, WorkoutExerciseDB, TaskDB
from backend.app.routes.models.workout import (
    WorkoutPlanResponse, WorkoutExerciseResponse,
    UpdateExerciseRequest, TaskResponse, TaskListResponse,
    ToggleTaskRequest, UpdateTaskRequest, CreateTaskRequest,
)
from app.services import workout_extractor
from app.ratelimit import rate_limit
from app.quota import charge_ai_action
from app.auth import get_current_user, AuthUser

router = APIRouter(prefix="/api", tags=["workout"])

# Per-reel caps on AI generations (each call costs Claude tokens). Tasks/steps are
# AI-generated ONCE; after that the user edits them by hand (add/edit/delete) — no
# regeneration. Workouts keep a small allowance.
TASKS_LIMIT = 1
WORKOUT_LIMIT = 3

# One message everywhere a sensitive reel is refused an action plan. Enforced
# server-side (the client hides the buttons, but that's cosmetic).
SENSITIVE_DETAIL = (
    "This save looks like medical or other sensitive advice, so SaveHere won't "
    "turn it into an action plan. The summary is for reference only — please "
    "consult a qualified professional."
)


def _reject_if_sensitive(reel: ReelDB) -> None:
    if bool(reel.is_sensitive):
        raise HTTPException(status_code=422, detail=SENSITIVE_DETAIL)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _get_reel_or_404(reel_id: str, user: AuthUser, db: Session) -> ReelDB:
    reel = db.query(ReelDB).filter(ReelDB.id == reel_id, ReelDB.user_id == user.id).first()
    if not reel:
        raise HTTPException(status_code=404, detail="Reel not found")
    return reel


def _get_owned_task_or_404(task_id: str, user: AuthUser, db: Session) -> TaskDB:
    """A task is owned via its parent reel — join so we never trust the task id alone."""
    task = (
        db.query(TaskDB)
        .join(ReelDB, TaskDB.reel_id == ReelDB.id)
        .filter(TaskDB.id == task_id, ReelDB.user_id == user.id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


def _get_owned_exercise_or_404(exercise_id: str, user: AuthUser, db: Session) -> WorkoutExerciseDB:
    ex = (
        db.query(WorkoutExerciseDB)
        .join(ReelDB, WorkoutExerciseDB.reel_id == ReelDB.id)
        .filter(WorkoutExerciseDB.id == exercise_id, ReelDB.user_id == user.id)
        .first()
    )
    if not ex:
        raise HTTPException(status_code=404, detail="Exercise not found")
    return ex


def _exercise_to_response(e: WorkoutExerciseDB) -> WorkoutExerciseResponse:
    return WorkoutExerciseResponse(
        id=e.id,
        name=e.name,
        type=e.type,
        muscle_group=e.muscle_group,
        sets=e.sets,
        reps=e.reps,
        duration_seconds=e.duration_seconds,
        rest_seconds=e.rest_seconds,
        is_estimated=e.is_estimated,
        sort_order=e.sort_order,
    )


def _task_to_response(t: TaskDB) -> TaskResponse:
    return TaskResponse(
        id=t.id,
        reel_id=t.reel_id,
        text=t.text,
        emoji=t.emoji,
        estimated_minutes=t.estimated_minutes,
        completed=t.completed,
        sort_order=t.sort_order,
    )


def _source_note(source: str) -> str | None:
    """User-facing disclaimer when steps weren't read from the actual video."""
    if source == "title":
        return "Couldn't read this video — these are general steps based on the title, not the actual recipe."
    if source == "notes":
        return "Based on the note you added, not the video itself."
    return None


def _build_plan_response(reel_id: str, exercises: list[WorkoutExerciseDB]) -> WorkoutPlanResponse:
    first = exercises[0] if exercises else None
    return WorkoutPlanResponse(
        reel_id=reel_id,
        workout_name=first.workout_name if first else "Custom Workout",
        difficulty=first.difficulty if first else "intermediate",
        estimated_minutes=first.estimated_minutes if first else 20,
        exercises=[_exercise_to_response(e) for e in exercises],
    )


# ── Workout routes ────────────────────────────────────────────────────────────

@router.post("/reels/{reel_id}/workout", response_model=WorkoutPlanResponse, dependencies=[Depends(rate_limit(10, 60, "workout"))])
def generate_workout(reel_id: str, user: AuthUser = Depends(get_current_user), db: Session = Depends(get_db)):
    reel = _get_reel_or_404(reel_id, user, db)
    _reject_if_sensitive(reel)

    if (reel.workout_count or 0) >= WORKOUT_LIMIT:
        raise HTTPException(
            status_code=429,
            detail=f"You've built a workout for this reel {WORKOUT_LIMIT} times — that's the limit for now (each one uses AI).",
        )

    source = reel.raw_text or reel.notes or reel.title or ""
    if not source:
        raise HTTPException(status_code=422, detail="No content to extract a workout from.")

    # Per-user daily AI budget (shared across all AI actions). Charged after the
    # free checks, before the Claude call.
    charge_ai_action(db, user)

    result = workout_extractor.extract_workout(
        platform=reel.platform,
        title=reel.title or "",
        text=source,
    )

    exercises = result.get("exercises") or []
    if not exercises:
        raise HTTPException(
            status_code=422,
            detail="No workout exercises found in this content. Try a reel that demonstrates specific exercises."
        )

    # Replace the existing plan only now that extraction succeeded — a failed
    # regeneration must never destroy a workout the user already had.
    db.query(WorkoutExerciseDB).filter(WorkoutExerciseDB.reel_id == reel_id).delete()

    workout_name = result.get("workout_name", "Custom Workout")
    difficulty = result.get("difficulty", "intermediate")
    estimated_minutes = result.get("estimated_minutes", 20)

    # Deduplicate by name (case-insensitive), keep first occurrence
    seen_names: set[str] = set()
    unique_exercises = []
    for ex in exercises:
        key = ex.get("name", "").strip().lower()
        if key and key not in seen_names:
            seen_names.add(key)
            unique_exercises.append(ex)
    exercises = unique_exercises

    db_exercises = []
    for i, ex in enumerate(exercises):
        db_ex = WorkoutExerciseDB(
            id=str(uuid.uuid4()),
            reel_id=reel_id,
            name=ex.get("name", "Exercise"),
            type=ex.get("type", "strength"),
            muscle_group=ex.get("muscle_group", "full_body"),
            sets=ex.get("sets"),
            reps=ex.get("reps"),
            duration_seconds=ex.get("duration_seconds"),
            rest_seconds=ex.get("rest_seconds", 60),
            is_estimated=ex.get("is_estimated", False),
            sort_order=i,
            workout_name=workout_name,
            difficulty=difficulty,
            estimated_minutes=estimated_minutes,
        )
        db.add(db_ex)
        db_exercises.append(db_ex)

    reel.workout_count = (reel.workout_count or 0) + 1
    db.commit()
    return _build_plan_response(reel_id, db_exercises)


@router.get("/reels/{reel_id}/workout", response_model=WorkoutPlanResponse)
def get_workout(reel_id: str, user: AuthUser = Depends(get_current_user), db: Session = Depends(get_db)):
    _get_reel_or_404(reel_id, user, db)
    exercises = (
        db.query(WorkoutExerciseDB)
        .filter(WorkoutExerciseDB.reel_id == reel_id)
        .order_by(WorkoutExerciseDB.sort_order)
        .all()
    )
    return _build_plan_response(reel_id, exercises)


@router.patch("/exercises/{exercise_id}", response_model=WorkoutExerciseResponse)
def update_exercise(exercise_id: str, body: UpdateExerciseRequest,
                    user: AuthUser = Depends(get_current_user), db: Session = Depends(get_db)):
    ex = _get_owned_exercise_or_404(exercise_id, user, db)
    if body.sets is not None:
        ex.sets = max(1, body.sets)
    if body.reps is not None:
        ex.reps = max(1, body.reps)
    if body.duration_seconds is not None:
        ex.duration_seconds = max(5, body.duration_seconds)
    if body.rest_seconds is not None:
        ex.rest_seconds = max(0, body.rest_seconds)
    db.commit()
    db.refresh(ex)
    return _exercise_to_response(ex)


# ── Task routes ───────────────────────────────────────────────────────────────

@router.post("/reels/{reel_id}/tasks", response_model=TaskListResponse, dependencies=[Depends(rate_limit(15, 60, "tasks"))])
def generate_tasks(reel_id: str, user: AuthUser = Depends(get_current_user), db: Session = Depends(get_db)):
    reel = _get_reel_or_404(reel_id, user, db)
    _reject_if_sensitive(reel)

    if (reel.tasks_count or 0) >= TASKS_LIMIT:
        raise HTTPException(
            status_code=429,
            detail="These were already generated with AI. You can add, edit, or delete them by hand — regenerating isn't available (it would use AI again).",
        )

    # Per-user daily AI budget (shared across all AI actions). Charged before the call.
    charge_ai_action(db, user)

    result = workout_extractor.extract_tasks(
        platform=reel.platform,
        title=reel.title or "",
        text=reel.raw_text or "",
        category=reel.category or "general",
        notes=reel.notes or "",
    )

    # Cooking with an unreadable video and a too-vague title: ask for a note.
    if result.get("needs_input"):
        raise HTTPException(
            status_code=422,
            detail="I couldn't tell what dish this is from the title. Add a note in Notes describing what you'd like (e.g. \"homemade pasta, desi style\"), then tap Get Recipe again.",
        )

    tasks = result.get("tasks") or []
    if not tasks:
        raise HTTPException(
            status_code=422,
            detail="Could not extract actionable tasks from this content."
        )

    list_kind = "steps" if result.get("kind") == "steps" else "tasks"
    row_kind = "step" if list_kind == "steps" else "task"
    src = result.get("source", "content")

    # Replace existing only now that we have a successful result (don't destroy
    # good tasks on a failed regeneration).
    db.query(TaskDB).filter(TaskDB.reel_id == reel_id).delete()
    db.commit()

    db_tasks = []
    for i, t in enumerate(tasks):
        db_task = TaskDB(
            id=str(uuid.uuid4()),
            reel_id=reel_id,
            text=t.get("text", ""),
            emoji=t.get("emoji", "✅"),
            estimated_minutes=t.get("estimated_minutes"),
            completed=False,
            sort_order=i,
            kind=row_kind,
            source=src,
            created_at=datetime.utcnow(),
        )
        db.add(db_task)
        db_tasks.append(db_task)

    reel.tasks_count = (reel.tasks_count or 0) + 1
    db.commit()
    return TaskListResponse(
        reel_id=reel_id,
        total=len(db_tasks),
        completed=0,
        kind=list_kind,
        source=src,
        note=_source_note(src),
        tasks=[_task_to_response(t) for t in db_tasks],
    )


@router.get("/reels/{reel_id}/tasks", response_model=TaskListResponse)
def get_tasks(reel_id: str, user: AuthUser = Depends(get_current_user), db: Session = Depends(get_db)):
    _get_reel_or_404(reel_id, user, db)
    tasks = (
        db.query(TaskDB)
        .filter(TaskDB.reel_id == reel_id)
        .order_by(TaskDB.sort_order)
        .all()
    )
    completed = sum(1 for t in tasks if t.completed)
    list_kind = "steps" if tasks and tasks[0].kind == "step" else "tasks"
    src = tasks[0].source if tasks else "content"
    return TaskListResponse(
        reel_id=reel_id,
        total=len(tasks),
        completed=completed,
        kind=list_kind,
        source=src,
        note=_source_note(src),
        tasks=[_task_to_response(t) for t in tasks],
    )


@router.post("/reels/{reel_id}/tasks/manual", response_model=TaskResponse)
def add_task(reel_id: str, body: CreateTaskRequest,
             user: AuthUser = Depends(get_current_user), db: Session = Depends(get_db)):
    """Add a single task/step by hand. No AI, no limit."""
    _get_reel_or_404(reel_id, user, db)
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(status_code=422, detail="Task text can't be empty.")

    existing = (
        db.query(TaskDB)
        .filter(TaskDB.reel_id == reel_id)
        .order_by(TaskDB.sort_order)
        .all()
    )
    # New manual item inherits the list's kind so a "steps" list stays numbered.
    kind = existing[0].kind if existing else "task"
    next_order = (max(t.sort_order for t in existing) + 1) if existing else 0

    task = TaskDB(
        id=str(uuid.uuid4()),
        reel_id=reel_id,
        text=text,
        emoji=body.emoji or "✅",
        estimated_minutes=body.estimated_minutes,
        completed=False,
        sort_order=next_order,
        kind=kind,
        source="manual",
        created_at=datetime.utcnow(),
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return _task_to_response(task)


@router.patch("/tasks/{task_id}", response_model=TaskResponse)
def update_task(task_id: str, body: UpdateTaskRequest,
                user: AuthUser = Depends(get_current_user), db: Session = Depends(get_db)):
    """Toggle completion and/or edit a task by hand. No AI."""
    task = _get_owned_task_or_404(task_id, user, db)
    if body.completed is not None:
        task.completed = body.completed
    if body.text is not None:
        text = body.text.strip()
        if not text:
            raise HTTPException(status_code=422, detail="Task text can't be empty.")
        task.text = text
    if body.estimated_minutes is not None:
        task.estimated_minutes = max(0, body.estimated_minutes)
    db.commit()
    db.refresh(task)
    return _task_to_response(task)


@router.delete("/tasks/{task_id}")
def delete_task(task_id: str, user: AuthUser = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete a single task/step by hand. No AI."""
    task = _get_owned_task_or_404(task_id, user, db)
    db.delete(task)
    db.commit()
    return {"message": "Deleted"}
