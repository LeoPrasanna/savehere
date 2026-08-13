"""Tests for the save-route logic that has caused real bugs: weak-title detection
and the float→int duration coercion that 500'd the list endpoint."""
from types import SimpleNamespace
from datetime import datetime

from app.routes import reels
from app.services import extractor


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


class TestLoginWallTitles:
    """Owner report, 2026-08-12: an Instagram save showed its real title for a
    moment and then changed to "Login • Instagram".

    Instagram does not error when it refuses the phone's preview fetch — it
    returns 200 with the SIGN-IN PAGE, whose og:title is the wall's own title
    and whose og:image is Instagram's artwork. Both fields are non-empty, so
    every "did we get a title?" check said yes and installed the wall's
    branding on the reel.
    """

    def test_login_wall_titles_are_detected(self):
        for t in [
            "Login • Instagram",
            "Log in to Facebook",
            "Login",
            "Sign in",
            "Instagram",
            "facebook",
            "Content Not Available",
            "Page Not Found",
        ]:
            assert reels._is_login_wall_title(t) is True, t

    def test_real_titles_are_not_login_walls(self):
        """The screen must not eat legitimate posts that merely mention login."""
        for t in [
            "How to make perfect pasta at home",
            "Login flows that don't annoy users",     # a real post ABOUT logins
            "Instagram growth tips for small brands",
            "5 sign-in patterns worth stealing",
        ]:
            assert reels._is_login_wall_title(t) is False, t

    def test_login_wall_title_is_always_weak(self):
        """`_weak_title` is the gate all three fill-sites share, so making the
        wall weak there is what stops any path installing it."""
        assert reels._weak_title("Login • Instagram") is True
        assert reels._weak_title("Log in to Facebook") is True


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


class TestLoginWallContent:
    """The other half of the login-wall problem (owner, 2026-08-12).

    Screening the TITLE was not enough. Instagram serves its sign-in page at
    HTTP 200 and its og:description is real prose of real length, so it was
    stored as `raw_text` and handed to Claude — which correctly summarized
    Instagram's login page and titled it "Login • Instagram". That AI title
    then overwrote the good one, which is why the title looked right until the
    summary finished and then got worse.
    """

    def test_platform_login_blurbs_are_detected(self):
        for t in [
            "Log in to see photos and videos from friends and discover other accounts you'll love.",
            "Sign up to see photos and videos from your friends.",
            "You must log in to continue.",
            "Sorry, this page isn't available.",
            "This content isn't available right now",
        ]:
            assert extractor.is_login_wall(t) is True, t

    def test_real_captions_are_not_login_walls(self):
        """Must not eat a genuine caption that happens to mention logging in."""
        for t in [
            "Here's my 5-minute high-protein breakfast: two eggs, oats, and a scoop of yoghurt.",
            "Day 12 of learning Python. Today I built a login screen and it actually works!",
            "Three things I wish I knew before I started lifting. Save this one.",
        ]:
            assert extractor.is_login_wall(t) is False, t

    def test_only_the_head_of_the_text_is_searched(self):
        """Positional, not just a substring match — that constraint is what
        stops a long real caption tripping it near the end."""
        caption = ("My honest review of this cafe after three visits. " * 6
                   + "you must log in to continue")
        assert extractor.is_login_wall(caption) is False

    def test_empty_text_is_not_a_login_wall(self):
        assert extractor.is_login_wall("") is False
        assert extractor.is_login_wall(None) is False
