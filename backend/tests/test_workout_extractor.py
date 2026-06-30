"""Regression tests for extract_tasks' cooking-fallback logic — the path behind the
old 'Could not extract actionable tasks' bug. No live AI: the Claude client and the
infer-recipe helper are monkeypatched, so these test the decision logic only."""
import json
from types import SimpleNamespace

from app.services import workout_extractor as we


def _fake_msg(payload: dict):
    """Mimic the Anthropic response shape: msg.content[0].text == JSON string."""
    return SimpleNamespace(content=[SimpleNamespace(text=json.dumps(payload))])


def _stub_client(monkeypatch, payload: dict):
    monkeypatch.setattr(we.client, "messages",
                        SimpleNamespace(create=lambda **kw: _fake_msg(payload)))


def _spy_infer(monkeypatch, sentinel):
    called = {"n": 0}
    def fake_infer(title, notes):
        called["n"] += 1
        return sentinel
    monkeypatch.setattr(we, "_infer_recipe", fake_infer)
    return called


class TestCookingFallback:
    def test_short_cooking_content_goes_straight_to_infer(self, monkeypatch):
        sentinel = {"kind": "steps", "tasks": [{"text": "x"}], "needs_input": False, "source": "title"}
        called = _spy_infer(monkeypatch, sentinel)
        # No client stub needed — the short-content guard returns before any AI call.
        out = we.extract_tasks(platform="instagram", title="Pasta", text="tiny",
                               category="cooking", notes="")
        assert out is sentinel
        assert called["n"] == 1

    def test_cooking_with_content_but_empty_model_result_falls_through_to_infer(self, monkeypatch):
        # THE REGRESSION: caption says "recipe in pinned comment" — long enough to
        # pass the content guard, but the recipe prompt returns no steps.
        sentinel = {"kind": "steps", "tasks": [{"text": "boil"}], "needs_input": False, "source": "title"}
        called = _spy_infer(monkeypatch, sentinel)
        _stub_client(monkeypatch, {"tasks": []})  # model found nothing
        out = we.extract_tasks(
            platform="instagram", title="Best Carbonara",
            text="Full recipe is in my pinned comment, go check it out!" * 2,
            category="cooking", notes="",
        )
        assert out is sentinel            # fell through instead of returning empty
        assert called["n"] == 1

    def test_cooking_with_real_steps_does_not_infer(self, monkeypatch):
        called = _spy_infer(monkeypatch, {"should": "not be used"})
        _stub_client(monkeypatch, {"tasks": [{"text": "Boil water", "emoji": "🔥"}]})
        out = we.extract_tasks(platform="youtube", title="Pasta",
                               text="Boil water then add pasta and cook 8 minutes." * 2,
                               category="cooking", notes="")
        assert called["n"] == 0
        assert out["kind"] == "steps"     # cooking is always normalized to steps
        assert out["tasks"][0]["text"] == "Boil water"
        assert out["needs_input"] is False


class TestNonCooking:
    def test_tasks_kind_is_normalized(self, monkeypatch):
        _stub_client(monkeypatch, {"kind": "weird", "tasks": [{"text": "Do thing"}]})
        out = we.extract_tasks(platform="tiktok", title="Tips",
                               text="Here are some productivity tips you can use." * 2,
                               category="productivity", notes="")
        assert out["kind"] == "tasks"     # anything not "steps" → "tasks"
        assert out["source"] == "content"

    def test_steps_kind_is_preserved(self, monkeypatch):
        _stub_client(monkeypatch, {"kind": "steps", "tasks": [{"text": "Step one"}]})
        out = we.extract_tasks(platform="youtube", title="How to build a shelf",
                               text="First measure the wood, then cut it to size." * 2,
                               category="diy", notes="")
        assert out["kind"] == "steps"

    def test_non_list_tasks_is_coerced_to_empty(self, monkeypatch):
        # Malformed model output must not crash the route.
        _stub_client(monkeypatch, {"tasks": "not a list"})
        out = we.extract_tasks(platform="tiktok", title="Tips",
                               text="Some content here that is long enough to pass." * 2,
                               category="news", notes="")
        assert out["tasks"] == []
