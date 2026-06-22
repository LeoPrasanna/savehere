"""Tests for the save-route logic that has caused real bugs: weak-title detection
and the float→int duration coercion that 500'd the list endpoint."""
from types import SimpleNamespace
from datetime import datetime

from app.routes import reels


class TestWeakTitle:
    def test_empty_or_short_is_weak(self):
        assert reels._weak_title(None) is True
        assert reels._weak_title("") is True
        assert reels._weak_title("abc") is True

    def test_day_headline_is_weak(self):
        assert reels._weak_title("Day352:- consistency") is True
        assert reels._weak_title("Day 12: tips") is True

    def test_platform_placeholder_is_weak(self):
        assert reels._weak_title("Facebook Reel") is True
        assert reels._weak_title("Instagram Post") is True

    def test_video_by_is_weak(self):
        assert reels._weak_title("Video by John Doe") is True
        assert reels._weak_title("Reel by someone") is True

    def test_hashtag_soup_is_weak(self):
        assert reels._weak_title("#a #b #c") is True

    def test_real_title_is_not_weak(self):
        assert reels._weak_title("How to make perfect pasta at home") is False
        assert reels._weak_title("Best Percent Hack - Find Percents Shortcut") is False


def _fake_reel(**over):
    base = dict(
        id="1", url="u", platform="youtube", title="t", thumbnail_url=None,
        uploader=None, duration=None, summary=["a"], tags=["x"], category="tech",
        notes=None, summarize_count=0, tasks_count=0, workout_count=0,
        created_at=datetime.utcnow(),
    )
    base.update(over)
    return SimpleNamespace(**base)


class TestToResponse:
    def test_float_duration_is_coerced_to_int(self):
        resp = reels._to_response(_fake_reel(duration=7.753))
        assert resp.duration == 7

    def test_none_duration_stays_none(self):
        assert reels._to_response(_fake_reel(duration=None)).duration is None

    def test_null_summary_and_tags_become_lists(self):
        resp = reels._to_response(_fake_reel(summary=None, tags=None))
        assert resp.summary == []
        assert resp.tags == []
