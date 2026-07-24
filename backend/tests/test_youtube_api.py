"""YouTube Data API v3 fallback — the only path that reads a Short's description
from a datacenter IP.

Why it exists: yt-dlp and the watch-page scrape are both bot-blocked on Render.
Measured on the deployed backend, a save came back with title+thumbnail but
`duration: None` and zero text, while the same URL from a residential IP yielded
570 chars of description. Without this fallback every YouTube save on the server
degrades to a link-only bookmark, no matter how many times it's retried.

No network here: httpx.get is monkeypatched.
"""
import pytest

from app.services import extractor
from app.config import settings


class FakeResp:
    def __init__(self, status=200, payload=None):
        self.status_code = status
        self._payload = payload or {}
    def json(self):
        return self._payload


SNIPPET = {
    "items": [{
        "snippet": {
            "title": "3 Bali Travel Tips for First-Timers",
            "description": "Here are three things I'd do differently on my next trip to Bali. " * 3,
            "channelTitle": "Wander",
            "thumbnails": {"high": {"url": "https://i.ytimg.com/vi/x/hq.jpg"}},
        }
    }]
}


@pytest.fixture
def with_key(monkeypatch):
    monkeypatch.setattr(settings, "YOUTUBE_API_KEY", "test-key")
    return settings


class TestVideoId:
    @pytest.mark.parametrize("url,vid", [
        ("https://youtube.com/shorts/cT5S4En6XDg", "cT5S4En6XDg"),
        ("https://youtube.com/shorts/cT5S4En6XDg?si=abc", "cT5S4En6XDg"),
        ("https://www.youtube.com/watch?v=bmDPYEan7Uc", "bmDPYEan7Uc"),
        ("https://youtu.be/k4rWFjlAaow", "k4rWFjlAaow"),
    ])
    def test_parses_every_url_shape_we_accept(self, url, vid):
        assert extractor._youtube_id(url) == vid

    def test_unrecognised_url_yields_nothing(self):
        assert extractor._youtube_id("https://example.com/video") == ""


class TestDataApiFallback:
    def test_no_key_makes_no_request(self, monkeypatch):
        """Must degrade to exactly the old behaviour when unconfigured."""
        monkeypatch.setattr(settings, "YOUTUBE_API_KEY", "")
        called = []
        monkeypatch.setattr(extractor.httpx, "get", lambda *a, **k: called.append(1))
        assert extractor._youtube_data_api("https://youtube.com/shorts/abc123") == {}
        assert not called, "called the API without a key"

    def test_recovers_the_description(self, with_key, monkeypatch):
        monkeypatch.setattr(extractor.httpx, "get", lambda *a, **k: FakeResp(200, SNIPPET))
        got = extractor._youtube_data_api("https://youtube.com/shorts/cT5S4En6XDg")
        assert got["title"] == "3 Bali Travel Tips for First-Timers"
        assert len(got["description"]) >= 50
        assert got["uploader"] == "Wander"

    def test_uses_videos_list_with_one_unit_not_search(self, with_key, monkeypatch):
        """search.list costs 100 units vs 1 for videos.list — using the wrong one
        would burn the daily quota 100x faster."""
        seen = {}
        def fake_get(url, params=None, **k):
            seen["url"] = url; seen["params"] = params or {}
            return FakeResp(200, SNIPPET)
        monkeypatch.setattr(extractor.httpx, "get", fake_get)
        extractor._youtube_data_api("https://youtube.com/shorts/cT5S4En6XDg")
        assert seen["url"].endswith("/videos")
        assert seen["params"]["id"] == "cT5S4En6XDg"
        assert seen["params"]["part"] == "snippet"

    def test_quota_exhausted_degrades_quietly(self, with_key, monkeypatch):
        """403 = quotaExceeded. Must not raise — the save falls back to a
        link-only bookmark rather than erroring."""
        monkeypatch.setattr(extractor.httpx, "get", lambda *a, **k: FakeResp(403, {}))
        assert extractor._youtube_data_api("https://youtube.com/shorts/abc123") == {}

    def test_unknown_video_returns_nothing(self, with_key, monkeypatch):
        monkeypatch.setattr(extractor.httpx, "get", lambda *a, **k: FakeResp(200, {"items": []}))
        assert extractor._youtube_data_api("https://youtube.com/shorts/abc123") == {}

    def test_network_failure_returns_nothing(self, with_key, monkeypatch):
        def boom(*a, **k):
            raise RuntimeError("connection reset")
        monkeypatch.setattr(extractor.httpx, "get", boom)
        assert extractor._youtube_data_api("https://youtube.com/shorts/abc123") == {}
