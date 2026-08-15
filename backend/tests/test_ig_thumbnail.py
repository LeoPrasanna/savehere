"""Instagram embed → thumbnail parsing.

⚠️ WHY THIS FILE EXISTS. `instagram_embed()` read the thumbnail with
`re.search(r'"display_url":"(.*?)"', html)`, which matched **nothing** — 0/5
against real saved reels on 2026-08-15, and 0/8 on the full local set.

The embed page carries its JSON blob *escaped inside an HTML attribute*, so the
real bytes are `\\"display_url\\":\\"https:\\\\\\/\\\\\\/...`. There is a
backslash between `display_url` and its colon, and the unescaped pattern cannot
cross it. Nothing errored; the function just returned `image: ""` forever.

The cost of that silent miss was the whole repair feature: `POST
/reels/{id}/thumbnail` answered 422 "the post may be private or deleted" for
every single Instagram save, which reads as an Instagram problem rather than a
regex problem.

These tests pin the *shape of the real page*, not the current implementation —
the fixture below is trimmed from a genuine embed response. No network.
"""
import re

from app.services import extractor


# Trimmed from a real `/embed/captioned/` response. Two things are load-bearing
# and must not be "tidied": the JSON is backslash-escaped, and the <img> src
# carries `&amp;` between its query parameters.
EMBED_HTML = (
    '<html><body>'
    '<script type="application/json">{\\"shortcode\\":\\"DUAUrjuAZ1U\\",'
    '\\"is_video\\":true,\\"display_url\\":\\"https:\\\\\\/\\\\\\/instagram.f'
    'hyd2-3.fna.fbcdn.net\\\\\\/v\\\\\\/t51.71878-15\\\\\\/622718183_n.jpg\\"}'
    '</script>'
    '<a href="https://www.instagram.com/reel/DUAUrjuAZ1U/">'
    '<img class="EmbeddedMediaImage" alt="Instagram post shared by &#064;x" '
    'src="https://instagram.fhyd2-3.fna.fbcdn.net/v/t51.71878-15/622718183_n.jpg'
    '?stp=dst-jpg_e15&amp;_nc_ht=instagram.fhyd2-3.fna.fbcdn.net&amp;oe=68A5F1B2"/>'
    '</a>'
    '<div class="Caption"><a>megh</a> a real caption here</div>'
    '</body></html>'
)


class _FakeResponse:
    status_code = 200

    def __init__(self, text):
        self.text = text


def _patch(monkeypatch, html):
    monkeypatch.setattr(
        extractor._http, "get", lambda *a, **k: _FakeResponse(html)
    )


def test_thumbnail_is_extracted_from_the_embed(monkeypatch):
    _patch(monkeypatch, EMBED_HTML)
    out = extractor.instagram_embed("https://www.instagram.com/reel/DUAUrjuAZ1U/")
    assert out["image"].startswith("https://instagram.")
    assert out["image"].endswith("oe=68A5F1B2")


def test_ampersands_are_unescaped():
    """`&amp;` left in place turns a signed CDN URL into a 403.

    The src is an HTML attribute, so its query separators arrive entity-encoded.
    This is the difference between a working image and a broken one, and it is
    invisible until the URL is actually requested.
    """
    from html import unescape

    raw = extractor._IG_EMBED_IMG.search(EMBED_HTML).group(1)
    assert "&amp;" in raw, "fixture no longer exercises the escaping"
    assert "&amp;" not in unescape(raw)


def test_the_old_pattern_could_never_have_matched():
    """Pins the actual bug so it cannot be reintroduced as a 'simplification'.

    If someone later 'cleans up' the img-tag regex back to reading the JSON,
    this is the test that tells them why that does not work.
    """
    assert re.search(r'"display_url":"(.*?)"', EMBED_HTML) is None
    assert extractor._IG_EMBED_IMG.search(EMBED_HTML) is not None


def test_post_urls_work_not_only_reels(monkeypatch):
    """The owner reported posts specifically. `/p/` must resolve like `/reel/`."""
    _patch(monkeypatch, EMBED_HTML)
    out = extractor.instagram_embed("https://www.instagram.com/p/DUAUrjuAZ1U/")
    assert out["image"]


def test_missing_image_is_empty_not_an_exception(monkeypatch):
    """A private/deleted post must degrade to "" so callers can 422 honestly."""
    _patch(monkeypatch, "<html><body><div class='Caption'></div></body></html>")
    out = extractor.instagram_embed("https://www.instagram.com/reel/XXXXXXXXXXX/")
    assert out["image"] == ""


def test_no_shortcode_returns_empty_dict():
    assert extractor.instagram_embed("https://example.com/not-instagram") == {}
