"""Pure-function tests for the extraction pipeline — the core of save reliability."""
from app.services import extractor


class TestNormalizeUrl:
    def test_youtu_be_becomes_shorts(self):
        assert extractor.normalize_url("https://youtu.be/dQw4w9WgXcQ?si=abc") == \
            "https://www.youtube.com/shorts/dQw4w9WgXcQ"

    def test_strips_tracking_params(self):
        assert extractor.normalize_url("https://ex.com/p?utm_source=ig&keep=1") == \
            "https://ex.com/p?keep=1"

    def test_strips_youtube_si_keeps_real_params(self):
        assert extractor.normalize_url("https://www.youtube.com/shorts/AbC?si=x&t=5") == \
            "https://www.youtube.com/shorts/AbC?t=5"

    def test_trailing_slash_removed(self):
        assert extractor.normalize_url("https://ex.com/p/") == "https://ex.com/p"

    def test_fragment_removed(self):
        assert extractor.normalize_url("https://ex.com/p#section") == "https://ex.com/p"


class TestDetectPlatform:
    def test_each_platform(self):
        assert extractor.detect_platform("https://instagram.com/reel/x") == "instagram"
        assert extractor.detect_platform("https://youtu.be/x") == "youtube"
        assert extractor.detect_platform("https://www.youtube.com/shorts/x") == "youtube"
        assert extractor.detect_platform("https://www.tiktok.com/@a/video/1") == "tiktok"
        assert extractor.detect_platform("https://www.linkedin.com/posts/x") == "linkedin"
        assert extractor.detect_platform("https://www.facebook.com/reel/1") == "facebook"
        assert extractor.detect_platform("https://fb.watch/x") == "facebook"
        assert extractor.detect_platform("https://example.com/x") == "unknown"


class TestParseVtt:
    def test_dedupes_strips_tags_and_metadata(self):
        vtt = (
            "WEBVTT\n"
            "Kind: captions\n"
            "Language: en\n"
            "\n"
            "00:00:00.000 --> 00:00:02.000\n"
            "Hello world\n"
            "\n"
            "00:00:02.000 --> 00:00:04.000\n"
            "Hello world\n"
            "\n"
            "00:00:04.000 --> 00:00:06.000\n"
            "<c>Second</c> line\n"
        )
        assert extractor._parse_vtt(vtt) == "Hello world Second line"

    def test_empty(self):
        assert extractor._parse_vtt("WEBVTT\n") == ""
