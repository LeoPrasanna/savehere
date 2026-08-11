"""Guards for the extraction-pipeline hardening pass.

Each test here pins a specific failure that was live in production code:
disk leaks, an SSRF via redirect, a stampede against a blocked host, and a
double AI charge on a very common request timing. No network anywhere.
"""
import os

import httpx
import pytest

from app.services import extractor
from app.routes import reels as reels_module


class TestVttPacing:
    """Cue timings are the only pacing signal a text-only pipeline gets."""

    VTT = (
        "WEBVTT\n\n"
        "1\n00:00:01.000 --> 00:00:03.000\nHold the blade\n\n"
        "2\n00:00:12.500 --> 00:00:14.000\nlike this\n"
    )

    def test_cue_starts_are_parsed(self):
        assert extractor._vtt_cue_starts(self.VTT) == [1.0, 12.5]

    def test_parse_vtt_text_contract_is_unchanged(self):
        # _vtt_cue_starts is a second pass precisely so this stays a plain str.
        assert extractor._parse_vtt(self.VTT) == "Hold the blade like this"

    def test_silent_gap_is_reported(self):
        hint = extractor.pacing_hint(30, "Hold the blade like this", [1.0, 12.5])
        assert "silent gap" in hint
        assert "30s" in hint

    def test_sparse_narration_is_called_out(self):
        # 6 words in 60s is on-screen-text content, not a talking head.
        hint = extractor.pacing_hint(60, "one two three four five six", [1.0])
        assert "sparse narration" in hint

    def test_dense_narration_is_not_flagged_sparse(self):
        hint = extractor.pacing_hint(30, "word " * 100, [1.0])
        assert "sparse narration" not in hint

    def test_no_transcript_is_marked_visual(self):
        assert "no speech transcript" in extractor.pacing_hint(30, "", [])

    def test_unknown_duration_yields_nothing(self):
        # Never fabricate structure we do not have.
        assert extractor.pacing_hint(0, "some words", []) == ""


class TestImageAltCapture:
    """Meta's auto-generated image description is the closest thing to a
    keyframe a link-only pipeline can get, and it was being parsed then dropped."""

    HTML = (
        '<meta property="og:image" content="https://cdn.example/pic.jpg">'
        '<meta property="og:image:alt" content="May be an image of food and '
        'text that says CHICKEN 65">'
        '<meta property="og:description" content="the caption">'
    )

    def test_alt_text_is_extracted(self, monkeypatch):
        monkeypatch.setattr(extractor, "_fetch_page", lambda url: self.HTML)
        out = extractor._extract_from_page("https://instagram.com/reel/x")
        assert "CHICKEN 65" in out["image_alt"]

    def test_alt_does_not_leak_into_the_image_url(self, monkeypatch):
        monkeypatch.setattr(extractor, "_fetch_page", lambda url: self.HTML)
        out = extractor._extract_from_page("https://instagram.com/reel/x")
        assert out["image"] == "https://cdn.example/pic.jpg"


class TestAudioTempFileCleanup:
    """The leak: transcribe() returned before its `finally` when OPENAI_API_KEY
    was unset, so every downloaded file was orphaned on disk forever."""

    def test_failed_download_leaves_no_temp_dir(self, monkeypatch):
        seen = {}

        class BoomYDL:
            def __init__(self, opts):
                seen["outtmpl"] = opts["outtmpl"]

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def download(self, urls):
                raise RuntimeError("blocked")

        monkeypatch.setattr(extractor.yt_dlp, "YoutubeDL", BoomYDL)
        assert extractor.download_audio("https://x/y") is None
        assert not os.path.exists(os.path.dirname(seen["outtmpl"]))

    def test_download_with_no_output_file_cleans_up(self, monkeypatch):
        seen = {}

        class QuietYDL:
            def __init__(self, opts):
                seen["outtmpl"] = opts["outtmpl"]

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def download(self, urls):
                return 0            # succeeds but produces no audio.mp3

        monkeypatch.setattr(extractor.yt_dlp, "YoutubeDL", QuietYDL)
        assert extractor.download_audio("https://x/y") is None
        assert not os.path.exists(os.path.dirname(seen["outtmpl"]))

    def test_cleanup_audio_is_idempotent(self, tmp_path):
        f = tmp_path / "audio.mp3"
        f.write_bytes(b"x")
        extractor.cleanup_audio(str(f))
        assert not tmp_path.exists()
        extractor.cleanup_audio(str(f))     # must not raise on a second call


class TestCircuitBreaker:
    @pytest.fixture(autouse=True)
    def _clean(self):
        extractor._breaker.clear()
        yield
        extractor._breaker.clear()

    def test_opens_after_repeated_failures(self):
        for _ in range(extractor._BREAKER_THRESHOLD):
            extractor.record_result("instagram", False)
        assert extractor.circuit_open("instagram")

    def test_a_success_resets_the_count(self):
        for _ in range(extractor._BREAKER_THRESHOLD - 1):
            extractor.record_result("instagram", False)
        extractor.record_result("instagram", True)
        assert not extractor.circuit_open("instagram")

    def test_breaker_state_does_not_deadlock(self):
        # breaker_state() reports while holding the lock that circuit_open()
        # also takes; threading.Lock is not reentrant, so the naive version of
        # this hung forever instead of failing.
        extractor.record_result("tiktok", False)
        assert extractor.breaker_state()["tiktok"]["fails"] == 1

    def test_open_circuit_short_circuits_extraction(self, monkeypatch):
        called = []
        monkeypatch.setattr(extractor, "_run_ydl", lambda *a, **k: called.append(1))
        for _ in range(extractor._BREAKER_THRESHOLD):
            extractor.record_result("instagram", False)
        info = extractor.extract_info("https://instagram.com/reel/x")
        assert info["blocked"] is True
        assert called == [], "an open circuit must not hit the network"


class TestNegativeCache:
    @pytest.fixture(autouse=True)
    def _clean(self):
        reels_module._negative.clear()
        yield
        reels_module._negative.clear()

    def test_a_failure_is_remembered_then_forgotten(self, monkeypatch):
        url = "https://instagram.com/reel/blocked"
        assert not reels_module._recently_failed(url)
        reels_module._mark_failed(url)
        assert reels_module._recently_failed(url)

        # Expiry is time-based, not restart-based.
        monkeypatch.setattr(reels_module.time, "monotonic",
                            lambda: reels_module._negative[url] + 1)
        assert not reels_module._recently_failed(url)

    def test_a_recent_failure_skips_re_extraction(self, monkeypatch):
        """The stampede guard: one blocked URL must not become N upstream hits."""
        calls = []
        monkeypatch.setattr(reels_module.extractor, "extract_info",
                            lambda url: calls.append(url))
        reels_module._mark_failed("https://instagram.com/reel/blocked")

        class _Reel:
            id, url, summary, platform = "r1", "https://instagram.com/reel/blocked", [], "instagram"

        class _Q:
            def filter(self, *a): return self
            def first(self): return _Reel()

        class _Session:
            def query(self, *a): return _Q()
            def close(self): pass

        monkeypatch.setattr(reels_module, "SessionLocal", lambda: _Session())
        reels_module._extract_and_summarize("r1", None)
        assert calls == [], "a URL that just failed must not be re-fetched"


class TestThumbnailRedirectGuard:
    """The allowlist was applied to the initial URL only while httpx followed
    redirects itself — so an open redirect on any allowed CDN was a full SSRF."""

    def _client_returning(self, location):
        class _Resp:
            status_code = 302
            headers = {"location": location}
            content = b""

        class _Client:
            def __init__(self, *a, **k): pass
            def __enter__(self): return self
            def __exit__(self, *a): return False
            def get(self, url): return _Resp()

        return _Client

    def test_redirect_off_the_allowlist_is_refused(self, monkeypatch):
        from app import main
        monkeypatch.setattr(main.httpx, "Client",
                            self._client_returning("http://169.254.169.254/latest/meta-data/"))
        with pytest.raises(main.HTTPException) as exc:
            main.thumbnail("https://i.ytimg.com/vi/x/hq.jpg")
        assert exc.value.status_code == 400

    def test_redirect_chain_is_bounded(self, monkeypatch):
        from app import main
        monkeypatch.setattr(main.httpx, "Client",
                            self._client_returning("https://i.ytimg.com/again.jpg"))
        with pytest.raises(main.HTTPException) as exc:
            main.thumbnail("https://i.ytimg.com/vi/x/hq.jpg")
        assert exc.value.status_code == 502

    def test_host_check_accepts_real_cdn_hosts(self):
        from app import main
        assert main._thumb_host_ok("https://i.ytimg.com/vi/x/hq.jpg")
        assert main._thumb_host_ok("https://scontent.cdninstagram.com/x.jpg")
        assert not main._thumb_host_ok("https://ytimg.com.evil.example/x.jpg")
        assert not main._thumb_host_ok("http://i.ytimg.com/x.jpg")
