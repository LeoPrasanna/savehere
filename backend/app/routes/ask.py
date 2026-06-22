from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db, ReelDB
from app.models.reel import ReelResponse
from app.services import librarian
from app.routes.reels import _to_response
from app.ratelimit import rate_limit

router = APIRouter(prefix="/api", tags=["ask"])

# "Ask your library" is the only AI feature without a natural per-item cap, so it
# carries TWO per-IP guards: a burst limit (anti-loop) and a daily budget cap that
# bounds the worst-case Claude spend per user. ~15/day is invisible to real users
# (who rarely ask their own library that often) but caps the cost tail.
# NOTE: per-IP is an interim guardrail; the real per-user cap lands with auth.
ASK_DAILY_LIMIT = 15
_ASK_DAILY_MSG = (
    f"You've reached today's limit of {ASK_DAILY_LIMIT} AI questions. "
    "It resets tomorrow — your saved reels are still here to browse and search."
)


class AskRequest(BaseModel):
    question: str


class AskResponse(BaseModel):
    answer: str
    sources: list[ReelResponse]


@router.post(
    "/ask",
    response_model=AskResponse,
    dependencies=[
        Depends(rate_limit(15, 60, "ask")),                       # burst guard (anti-loop)
        Depends(rate_limit(ASK_DAILY_LIMIT, 86400, "ask_daily", message=_ASK_DAILY_MSG)),  # daily budget cap
    ],
)
def ask(body: AskRequest, db: Session = Depends(get_db)):
    q = (body.question or "").strip()
    if len(q) < 3:
        raise HTTPException(status_code=422, detail="Ask a real question — a few words at least.")

    reels = db.query(ReelDB).order_by(ReelDB.created_at.desc()).all()
    payload = [
        {"id": r.id, "title": r.title, "summary": r.summary or [], "tags": r.tags or [], "notes": r.notes}
        for r in reels
    ]

    result = librarian.ask_library(q, payload)

    id_set = set(result.get("source_ids") or [])
    sources = [_to_response(r) for r in reels if r.id in id_set]
    return AskResponse(answer=result.get("answer", ""), sources=sources)
