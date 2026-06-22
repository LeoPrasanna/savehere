"""Tests for the retrieval that keeps Ask-your-library cost bounded — only the
most relevant saves are sent to Claude, not the whole library."""
from app.services import librarian


def _reel(rid, title, tags=None, summary=None, notes=None):
    return {"id": rid, "title": title, "tags": tags or [], "summary": summary or [], "notes": notes}


def test_small_library_returned_as_is():
    reels = [_reel("1", "a"), _reel("2", "b")]
    assert librarian._rank_relevant("anything at all", reels, 15) == reels


def test_relevant_reel_ranked_first():
    reels = [_reel(str(i), f"random clip {i}") for i in range(20)]
    reels.append(_reel("pasta", "How to make pasta", tags=["recipe", "pasta"], summary=["boil water"]))
    top = librarian._rank_relevant("how do i cook pasta", reels, 5)
    assert top[0]["id"] == "pasta"
    assert len(top) <= 5


def test_no_match_falls_back_to_recent():
    reels = [_reel(str(i), f"topic {i}", tags=[f"t{i}"]) for i in range(20)]
    top = librarian._rank_relevant("zzz nonexistent qqq", reels, 5)
    assert top == reels[:5]   # newest-first → first 5 are the most recent


def test_question_of_only_stopwords_falls_back_to_recent():
    reels = [_reel(str(i), f"topic {i}") for i in range(20)]
    top = librarian._rank_relevant("what did i save", reels, 5)
    assert top == reels[:5]
