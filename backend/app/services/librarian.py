import anthropic
import json
import re
from collections.abc import Iterator
from app.config import settings

client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

# Only send the most relevant saves to Claude, not the whole library. Fewer items
# and tighter per-item context = smaller prompt = lower time-to-first-token (the
# measured latency floor is input processing, not generation) and lower cost.
RETRIEVE_TOP_N = 12
# Per-item context caps — the model only needs the gist to answer, not the full
# summary. Trimming these cut the input ~35% with no measurable answer-quality loss.
_SUMMARY_CHARS = 240
_NOTES_CHARS = 120
_CONTEXT_CHARS = 8000
_MAX_TOKENS = 400

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

# Streaming prompt: plain prose only, NO JSON envelope — a JSON wrapper can't be
# rendered token-by-token (you need the whole object to parse). Sources are
# computed from the finished answer instead (see sources_from_answer), so the
# model just writes naturally and every token can hit the screen immediately.
STREAM_PROMPT = """You are the user's personal librarian for SaveHere, an app where they save short videos and posts that get AI summaries. Answer the user's question using ONLY the saved items listed below.

Question: {question}

Saved items:
{context}

RULES:
- Answer concisely and directly, grounded ONLY in the saved items above.
- Reference the relevant item(s) by title so the user knows which save it came from.
- If nothing here answers the question, say you couldn't find anything saved about that. Do NOT invent facts that aren't in the items.
- Write a plain, friendly answer — no JSON, no preamble, no markdown headers."""


def _build_context(question: str, reels: list[dict]) -> tuple[list[dict], str]:
    """Retrieve the most relevant saves and render them into a compact context
    block. Shared by the streaming and non-streaming paths."""
    relevant = _rank_relevant(question, reels, RETRIEVE_TOP_N)
    lines = []
    for r in relevant:
        summ = " ".join(r.get("summary") or [])[:_SUMMARY_CHARS]
        tags = ", ".join(r.get("tags") or [])
        notes = (r.get("notes") or "")[:_NOTES_CHARS]
        title = (r.get("title") or "Untitled").strip()
        lines.append(f"- [{r['id']}] {title} :: {summ} :: tags: {tags} :: notes: {notes}")
    return relevant, "\n".join(lines)[:_CONTEXT_CHARS]


def stream_answer(question: str, reels: list[dict]) -> Iterator[str]:
    """Yield the answer text token-by-token as Claude writes it. Retrieval runs
    once up front (cheap); only the model call streams. On error, yields a single
    friendly sentence so the client always shows something."""
    if not reels:
        yield "You haven't saved anything yet. Save a few reels and I'll help you recall and connect them."
        return
    _, context = _build_context(question, reels)
    try:
        with client.messages.stream(
            model="claude-haiku-4-5-20251001",
            max_tokens=_MAX_TOKENS,
            messages=[{"role": "user", "content": STREAM_PROMPT.format(question=question[:500], context=context)}],
        ) as stream:
            for text in stream.text_stream:
                yield text
    except Exception:
        yield "Something went wrong while searching your library. Please try again in a moment."


def sources_from_answer(answer: str, reels: list[dict]) -> list[str]:
    """Which saves did the answer actually draw on? Computed from the finished
    text (the streaming path has no LLM-returned ids): a save counts as a source
    when several of its title's content-words appear in the answer. Cheap, and
    more reliable than trusting the model to echo ids correctly."""
    answer_terms = _terms(answer)
    if not answer_terms:
        return []
    scored = []
    for r in reels:
        title_terms = _terms(r.get("title") or "")
        if not title_terms:
            continue
        overlap = len(title_terms & answer_terms)
        # Require a real match: most of a short title, or 2+ words of a long one.
        need = 1 if len(title_terms) <= 2 else 2
        if overlap >= need:
            scored.append((overlap, r["id"]))
    scored.sort(reverse=True)
    return [rid for _, rid in scored[:5]]


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

    relevant, context = _build_context(question, reels)

    try:
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=_MAX_TOKENS,
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
