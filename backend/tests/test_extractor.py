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


class TestOg:
    def test_reads_og_property(self):
        html = '<meta property="og:title" content="Hello World">'
        assert extractor._og(html, "title") == "Hello World"

    def test_unescapes_entities(self):
        html = '<meta property="og:description" content="Tom &amp; Jerry &lt;3">'
        assert extractor._og(html, "description") == "Tom & Jerry <3"

    def test_multiline_content_is_preserved(self):
        # Instagram recipe captions span newlines inside one <meta> tag.
        html = '<meta property="og:description" content="Step 1\nStep 2">'
        assert extractor._og(html, "description") == "Step 1\nStep 2"

    def test_missing_property_returns_empty(self):
        assert extractor._og('<meta property="og:title" content="x">', "image") == ""

    def test_sub_property_does_not_masquerade(self):
        # Regression: 'og:image:alt' (caption text) must NOT be returned for
        # 'og:image'. Facebook emits the alt tag, and the old substring match
        # returned it — so the thumbnail became the title string, not the image URL.
        html = (
            '<meta property="og:image:alt" content="A caption describing it">'
            '<meta property="og:image" content="https://cdn.example/pic.jpg">'
        )
        assert extractor._og(html, "image") == "https://cdn.example/pic.jpg"

    def test_matches_when_content_precedes_property(self):
        # Attribute order within the tag must not matter.
        html = '<meta content="https://cdn.example/x.jpg" property="og:image">'
        assert extractor._og(html, "image") == "https://cdn.example/x.jpg"

    def test_does_not_hang_on_huge_minified_page(self):
        # Regression guard: the old whole-document DOTALL pattern backtracked for
        # tens of seconds on ~600 KB of inline script with no clean <head>.
        import time
        html = '<script>' + ("var x=1;" * 80_000) + '</script>' \
               '<meta property="og:title" content="Found">'
        start = time.monotonic()
        assert extractor._og(html, "title") == "Found"
        assert time.monotonic() - start < 1.0


class TestExtractJsonld:
    def test_pulls_article_body(self):
        html = (
            '<script type="application/ld+json">'
            '{"articleBody": "Full LinkedIn post text", "headline": "Title"}'
            '</script>'
        )
        result = extractor._extract_jsonld(html)
        assert result["articleBody"] == "Full LinkedIn post text"
        assert result["headline"] == "Title"

    def test_handles_list_of_blocks(self):
        html = (
            '<script type="application/ld+json">'
            '[{"@type": "WebPage"}, {"text": "Body via text field"}]'
            '</script>'
        )
        assert extractor._extract_jsonld(html)["articleBody"] == "Body via text field"

    def test_invalid_json_is_skipped(self):
        assert extractor._extract_jsonld('<script type="application/ld+json">{bad}</script>') == {}


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
