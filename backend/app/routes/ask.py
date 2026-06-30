from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db, ReelDB
from app.models.reel import ReelResponse
from app.services import librarian
from app.routes.reels import _to_response
from app.ratelimit import rate_limit
from app.quota import charge_ai_action
from app.auth import get_current_user, AuthUser

router = APIRouter(prefix="/api", tags=["ask"])

# "Ask your library" is the only AI feature without a natural per-item cap. A per-IP
# burst guard (anti-loop) stays below; the daily budget is now the per-USER quota
# (enforce_daily_ai_quota), which all AI actions share — see app/quota.py.


class AskRequest(BaseModel):
    question: str


class AskResponse(BaseModel):
    answer: str
    sources: list[ReelResponse]


@router.post(
    "/ask",
    response_model=AskResponse,
    dependencies=[Depends(rate_limit(15, 60, "ask"))],   # burst guard (anti-loop)
)
def ask(body: AskRequest, user: AuthUser = Depends(get_current_user), db: Session = Depends(get_db)):
    q = (body.question or "").strip()
    if len(q) < 3:
        raise HTTPException(status_code=422, detail="Ask a real question — a few words at least.")

    # Per-user daily AI budget (shared across all AI actions). Charged before the call.
    charge_ai_action(db, user)

    reels = (
        db.query(ReelDB)
        .filter(ReelDB.user_id == user.id)
        .order_by(ReelDB.created_at.desc())
        .all()
    )
    payload = [
        {"id": r.id, "title": r.title, "summary": r.summary or [], "tags": r.tags or [], "notes": r.notes}
        for r in reels
    ]

    result = librarian.ask_library(q, payload)

    id_set = set(result.get("source_ids") or [])
    sources = [_to_response(r) for r in reels if r.id in id_set]
    return AskResponse(answer=result.get("answer", ""), sources=sources)
