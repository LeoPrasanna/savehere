"""Smart library search — lexical, zero AI cost.

Search fires on a 400 ms debounce from the client, so it must never hit Claude
(one browsing session would drain the daily AI quota). Instead it gets "smart"
the cheap way:

  - tokenize the query and drop filler ("any videos on fitness" → "fitness")
  - match the reel's CATEGORY too (the old LIKE search never looked at it, so
    "fitness" missed every fitness reel whose title was e.g. "Chest workout")
  - expand common synonyms (gym/workout/exercise ↔ fitness, recipe ↔ cooking)
  - rank by relevance: category/title/tag hits outweigh summary/notes hits

True semantic matching is the embeddings step tracked in TODO.md.
"""
import re

# Query words that carry no meaning for retrieval. Includes the "show me any
# videos on…" framing words so natural-phrase queries reduce to their topic.
_STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "with",
    "my", "your", "what", "whats", "how", "did", "do", "does", "is", "are", "was",
    "were", "i", "me", "we", "about", "that", "this", "these", "those", "it", "its",
    "there", "have", "has", "had", "save", "saved", "saves", "reel", "reels",
    "video", "videos", "post", "posts", "any", "some", "all", "from", "by", "at",
    "as", "be", "can", "you", "show", "find", "get", "give", "tell", "which",
    "clip", "clips", "content", "stuff", "things", "thing", "please",
}

# Bidirectional-enough synonym groups. Each term expands to its group so a query
# for "gym" also matches reels categorized/tagged "fitness" and vice versa.
# Kept deliberately small and high-precision — a wrong synonym pollutes results.
_SYNONYM_GROUPS: list[set[str]] = [
    {"fitness", "workout", "workouts", "gym", "exercise", "exercises", "training"},
    {"cooking", "recipe", "recipes", "food", "dish", "cook", "kitchen", "baking"},
    {"tech", "technology", "coding", "programming", "software", "developer"},
    {"finance", "money", "investing", "invest", "stocks", "budget", "budgeting"},
    {"health", "medical", "wellness", "nutrition", "diet"},
    {"travel", "trip", "vacation", "destination", "itinerary", "trek", "trekking",
     "hiking", "hike", "bike", "biking", "cycling", "camping", "backpacking", "roadtrip"},
    {"fashion", "outfit", "style", "clothes", "clothing"},
    {"beauty", "makeup", "skincare", "cosmetics", "grooming", "haircare", "hairstyle"},
    {"business", "startup", "entrepreneur", "marketing"},
    {"motivation", "mindset", "discipline", "inspiration", "motivational"},
    {"education", "learning", "study", "studying"},
]

_SYNONYMS: dict[str, set[str]] = {}
for _group in _SYNONYM_GROUPS:
    for _term in _group:
        _SYNONYMS.setdefault(_term, set()).update(_group)


def _singular(word: str) -> str:
    """Cheap plural folding: 'recipes' matches 'recipe'. Only strips a plain
    trailing 's' on longer words — no stemming surprises."""
    return word[:-1] if len(word) > 3 and word.endswith("s") and not word.endswith("ss") else word


def _tokens(text: str) -> set[str]:
    words = re.findall(r"[a-z0-9]+", (text or "").lower())
    out = set()
    for w in words:
        if len(w) < 2:
            continue
        out.add(w)
        out.add(_singular(w))
    return out


def query_terms(q: str) -> set[str]:
    """Meaningful query words, plural-folded, stopwords removed. Falls back to
    ALL words when the query is nothing but stopwords (so 'the the' ≠ match-all)."""
    words = [w for w in re.findall(r"[a-z0-9]+", (q or "").lower()) if len(w) >= 2]
    meaningful = [w for w in words if w not in _STOPWORDS]
    return {_singular(w) for w in (meaningful or words)}


def _expand(terms: set[str]) -> set[str]:
    expanded = set(terms)
    for t in terms:
        expanded |= _SYNONYMS.get(t, set())
        expanded |= _SYNONYMS.get(_singular(t), set())
    return {_singular(t) for t in expanded} | expanded


def _match_count(terms: set[str], toks: set[str]) -> int:
    """Terms that hit a token exactly, or as a prefix (>=3 chars) so results
    appear while the user is still typing ("fitn" → "fitness"), matching the
    type-ahead feel of the old LIKE search."""
    n = 0
    for t in terms:
        if t in toks or (len(t) >= 3 and any(tok.startswith(t) for tok in toks)):
            n += 1
    return n


def score_reel(terms: set[str], expanded: set[str], reel) -> int:
    """Relevance of one reel for the query. 0 = no match.

    Weights: direct query-term hits in title/tags count double a synonym hit;
    category matches are strong (that's the "any videos on Fitness" case);
    summary/notes/uploader hits are supporting evidence.
    """
    title_toks = _tokens(getattr(reel, "title", None) or "")
    tag_toks = _tokens(" ".join(getattr(reel, "tags", None) or []))
    cat_toks = _tokens(getattr(reel, "category", None) or "")
    body_toks = _tokens(
        " ".join(getattr(reel, "summary", None) or [])
        + " " + (getattr(reel, "notes", None) or "")
        + " " + (getattr(reel, "uploader", None) or "")
    )

    synonyms = expanded - terms
    score = 0
    score += 4 * _match_count(terms, title_toks | tag_toks)   # direct topic words
    score += 4 * _match_count(terms, cat_toks)                # direct category
    score += 2 * len(synonyms & (title_toks | tag_toks | cat_toks))  # synonym hits
    score += 1 * _match_count(terms, body_toks)               # summary/notes/uploader
    score += 1 * len(synonyms & body_toks)
    return score


def rank(q: str, reels: list) -> list:
    """Return `reels` filtered to matches and sorted by relevance (ties keep the
    incoming order, which callers pass newest-first)."""
    terms = query_terms(q)
    if not terms:
        return []
    expanded = _expand(terms)
    scored = [(score_reel(terms, expanded, r), idx, r) for idx, r in enumerate(reels)]
    matched = [(s, idx, r) for s, idx, r in scored if s > 0]
    matched.sort(key=lambda t: (-t[0], t[1]))
    return [r for _, _, r in matched]
