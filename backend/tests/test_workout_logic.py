"""Tests for the task/recipe source disclaimer logic."""
from app.routes import workout


def test_title_source_warns_it_is_not_the_actual_recipe():
    note = workout._source_note("title")
    assert note and "general steps" in note


def test_notes_source_mentions_the_note():
    note = workout._source_note("notes")
    assert note and "note" in note.lower()


def test_content_source_has_no_disclaimer():
    assert workout._source_note("content") is None
