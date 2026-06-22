import anthropic
import json
import re
from app.config import settings

client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

# Only send the most relevant saves to Claude, not the whole library — cuts input
# tokens ~3-4x per ask vs. dumping 60 items into every prompt.
RETRIEVE_TOP_N = 15

_STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "with",
    "my", "your", "what", "whats", "how", "did", "do", "does", "is", "are", "was",
    "were", "i", "me", "we", "about", "that", "this", "these", "those", "it", "its",
    "there", "have", "has", "had", "save", "saved", "saves", "reel", "reels",
    "video", "videos", "post", "posts", "any", "some", "all", "from", "by", "at",
    "as", "be", "can", "you", "show", "find", "get", "give", "tell", "which",
}


def _terms(text: str) -> set[str]:
    """Lowercase content words (>=3 chars, no stopwords) for overlap scoring."""
    return {w for w in re.findall(r"[a-z0-9]+", (text or "").lower())
            if len(w) >= 3 and w not in _STOPWORDS}


def _rank_relevant(question: str, reels: list[dict], top_n: int) -> list[dict]:
    """Return the up-to-`top_n` reels most relevant to the question by term overlap
    (title/tags weighted 2x). `reels` arrives newest-first; ties and the
    no-match case fall back to most-recent so general questions still get context."""
    if len(reels) <= top_n:
        return reels
    q = _terms(question)
    if not q:
        return reels[:top_n]
    scored = []
    for idx, r in enumerate(reels):
        title_terms = _terms(r.get("title") or "") | _terms(" ".join(r.get("tags") or []))
        body_terms = _terms(" ".join(r.get("summary") or []) + " " + (r.get("notes") or ""))
        score = 2 * len(q & title_terms) + len(q & body_terms)
        scored.append((score, -idx, r))          # tie-break: more recent first
    scored.sort(key=lambda t: (t[0], t[1]), reverse=True)
    top = [r for score, _, r in scored if score > 0][:top_n]
    return top or reels[:top_n]                  # no overlap → recent fallback

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

    relevant = _rank_relevant(question, reels, RETRIEVE_TOP_N)
    lines = []
    for r in relevant:
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
