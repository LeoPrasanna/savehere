import anthropic
import json
from app.config import settings

client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

ASK_PROMPT = """You are the user's personal librarian for SaveHere, an app where they save short videos and posts that get AI summaries. Answer the user's question using ONLY the saved items listed below.

Question: {question}

Saved items:
{context}

RULES:
- Answer concisely and directly, grounded ONLY in the saved items above.
- Reference the relevant item(s) by title in your answer when useful.
- If nothing in the saved items answers the question, say you couldn't find anything saved about that. Do NOT invent or guess facts that aren't in the items.
- Return this EXACT JSON: {{"answer": "your answer", "source_ids": ["id", ...]}}
- source_ids: the ids of items you actually used (max 5). Use [] if none were relevant.
- Respond ONLY with the JSON object."""


def _parse(raw_text: str) -> dict:
    raw = (raw_text or "").strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw)


def ask_library(question: str, reels: list[dict]) -> dict:
    """reels: [{id, title, summary[list], tags[list], notes}]. Returns {answer, source_ids}."""
    if not reels:
        return {
            "answer": "You haven't saved anything yet. Save a few reels and I'll help you recall and connect them.",
            "source_ids": [],
        }

    lines = []
    for r in reels[:60]:  # cap items for cost + token budget
        summ = " ".join(r.get("summary") or [])[:400]
        tags = ", ".join(r.get("tags") or [])
        notes = (r.get("notes") or "")[:200]
        title = (r.get("title") or "Untitled").strip()
        lines.append(f"- [{r['id']}] {title} :: {summ} :: tags: {tags} :: notes: {notes}")
    context = "\n".join(lines)[:12000]

    try:
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=500,
            messages=[{
                "role": "user",
                "content": ASK_PROMPT.format(question=question[:500], context=context),
            }],
        )
        result = _parse(msg.content[0].text)
    except Exception:
        return {
            "answer": "Something went wrong while searching your library. Please try again in a moment.",
            "source_ids": [],
            "error": True,
        }

    answer = (result.get("answer") or "").strip() if isinstance(result, dict) else ""
    ids = result.get("source_ids") if isinstance(result, dict) else None
    if not answer:
        answer = "I couldn't find anything saved about that yet."
    return {"answer": answer, "source_ids": ids if isinstance(ids, list) else []}
