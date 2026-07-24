"""Unit tests for the smart lexical search (app/services/search.py): natural
phrases, category matching, synonyms, prefix type-ahead, ranking. No DB, no AI."""
from types import SimpleNamespace

from app.services import search


def reel(**kw):
    base = dict(title=None, tags=[], category=None, summary=[], notes=None, uploader=None)
    base.update(kw)
    return SimpleNamespace(**base)


FITNESS = reel(title="Chestwork", tags=["chest", "gym"], category="fitness",
               summary=["3 sets of incline press"])
PASTA = reel(title="Perfect pasta recipe", tags=["cooking", "italian"], category="cooking",
             summary=["boil water"], notes="my kitchen notes")
FINANCE = reel(title="Budgeting tips", tags=["finance", "money"], category="finance",
               summary=["track spending"])


class TestTypoTolerance:
    """A single mistyped character used to return NOTHING, which reads as
    "search is broken" rather than "no matches". Fuzzy matching is deliberately
    limited to longer words — on short ones an edit changes the meaning."""

    def test_transposed_letters_still_find_the_reel(self):
        workout = reel(title="Chest workout at home", tags=["chest"], category="fitness")
        assert search.rank("wrokout", [workout, PASTA, FINANCE]) == [workout]

    def test_misspelled_recipe_finds_the_cooking_reel(self):
        assert search.rank("recipie", [FITNESS, PASTA, FINANCE]) == [PASTA]

    def test_misspelled_category_still_matches(self):
        assert search.rank("finence", [FITNESS, PASTA, FINANCE]) == [FINANCE]

    def test_short_words_stay_strict(self):
        """On a 3-letter word a single edit is a DIFFERENT word, so fuzzy matching
        is off below 5 chars — a confidently wrong result is worse than none.
        ('car' would legitimately match via the separate >=3-char prefix rule
        against 'care', so this uses a typo that is not also a prefix.)"""
        cat = reel(title="Cat basics", tags=["cat"], category="other")
        assert search.rank("cst", [cat]) == []

    def test_an_unrelated_query_still_returns_nothing(self):
        """Guard against fuzziness turning search into a match-everything."""
        assert search.rank("quantum astrophysics", [FITNESS, PASTA, FINANCE]) == []


class TestQueryTerms:
    def test_strips_filler_words(self):
        assert search.query_terms("any videos on Fitness") == {"fitness"}

    def test_folds_plurals(self):
        assert "recipe" in search.query_terms("recipes")

    def test_all_stopwords_falls_back_to_raw_words(self):
        # A query of pure filler must not become match-everything.
        assert search.query_terms("show me any") != set()


class TestRanking:
    def test_natural_phrase_matches_category(self):
        # The original bug: "any videos on Fitness" found nothing because only
        # title/tags/summary/notes were searched — category never was.
        out = search.rank("any videos on Fitness", [FITNESS, PASTA, FINANCE])
        assert out and out[0] is FITNESS

    def test_synonym_gym_finds_fitness_reel(self):
        assert search.rank("workout", [PASTA, FITNESS]) == [FITNESS]

    def test_title_match_still_works(self):
        assert search.rank("chestwork", [PASTA, FITNESS]) == [FITNESS]

    def test_prefix_typeahead(self):
        # Mid-typing "fitn" should already surface the fitness reel.
        assert search.rank("fitn", [PASTA, FITNESS]) == [FITNESS]

    def test_no_match_is_empty(self):
        assert search.rank("quantum physics", [PASTA, FINANCE]) == []

    def test_empty_query_is_empty(self):
        assert search.rank("", [PASTA]) == []
        assert search.rank("   ", [PASTA]) == []

    def test_direct_hit_outranks_synonym_hit(self):
        synonym_only = reel(title="Morning routine", category="fitness")
        direct = reel(title="Gym day", category="other")
        out = search.rank("gym", [synonym_only, direct])
        assert out[0] is direct  # exact title word beats synonym-only match

    def test_notes_match(self):
        assert search.rank("kitchen", [FINANCE, PASTA]) == [PASTA]

    def test_beauty_synonyms(self):
        glam = reel(title="5-minute glam routine", tags=["makeup"], category="beauty")
        assert search.rank("skincare", [PASTA, glam]) == [glam]

    def test_adventure_terms_find_travel(self):
        ladakh = reel(title="Ladakh on two wheels", tags=["biking"], category="travel")
        assert search.rank("trekking", [FINANCE, ladakh]) == [ladakh]
        assert search.rank("any bike trip videos", [PASTA, ladakh]) == [ladakh]
