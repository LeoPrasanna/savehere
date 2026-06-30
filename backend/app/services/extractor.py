import yt_dlp
import httpx
import re
import os
import json
import tempfile
import logging
from html import unescape
from typing import Optional

logger = logging.getLogger(__name__)

# Cap how many caption languages we'll try downloading so a video with dozens of
# auto-translated tracks can't stall extraction.
_MAX_CAPTION_TRIES = 3
_CAPTION_TIMEOUT = 5

_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}

# Link-preview crawler UA. Instagram/Facebook only serve the public og: caption
# (the text shown when a link unfurls) to recognized preview bots — a normal browser
# UA from a server IP gets the login wall instead. This is the ungated "link-preview
# surface": it works without auth and carries the full caption text.
_PREVIEW_HEADERS = {
    "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "Accept-Language": "en-US,en;q=0.9",
}


_STRIP_PARAMS = {
    # Universal tracking
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    # YouTube
    'si', 'feature', 'pp', 'ab_channel',
    # Instagram
    'igshid', 'igsh', 'img_index',
    # TikTok
    '_d', 'checksum', 'sec_uid', 'share_app_id', 'share_link_id',
    # LinkedIn
    'rcm', 'trk', 'trackingId', 'originalSubdomain',
}


def normalize_url(url: str) -> str:
    """Strip tracking parameters and canonicalize the URL for deduplication."""
    from urllib.parse import urlparse, urlencode, parse_qs, urlunparse

    parsed = urlparse(url.strip())
    params = parse_qs(parsed.query, keep_blank_values=False)
    cleaned = {k: v for k, v in params.items() if k.lower() not in _STRIP_PARAMS}
    clean_query = urlencode(cleaned, doseq=True)

    # youtu.be/ID → youtube.com/shorts/ID
    if parsed.netloc in ('youtu.be', 'www.youtu.be') and parsed.path.startswith('/'):
        video_id = parsed.path.lstrip('/')
        return f"https://www.youtube.com/shorts/{video_id}"

    return urlunparse((
        parsed.scheme,
        parsed.netloc.lstrip('www.') and parsed.netloc,
        parsed.path.rstrip('/') or '/',
        parsed.params,
        clean_query,
        '',   # strip fragments
    ))


def detect_platform(url: str) -> str:
    if "instagram.com" in url:
        return "instagram"
    elif "youtube.com" in url or "youtu.be" in url:
        return "youtube"
    elif "tiktok.com" in url:
        return "tiktok"
    elif "linkedin.com" in url:
        return "linkedin"
    elif "facebook.com" in url or "fb.watch" in url or "fb.com" in url:
        return "facebook"
    return "unknown"


def _parse_vtt(vtt: str) -> str:
    """Convert WebVTT caption content to clean plain text without duplicates."""
    seen = []
    for line in vtt.split('\n'):
        line = line.strip()
        if not line:
            continue
        # Skip VTT structural lines
        if line.startswith('WEBVTT') or '-->' in line:
            continue
        if re.match(r'^\d+$', line):
            continue
        # Skip VTT metadata lines (Kind: captions, Language: en, etc.)
        if re.match(r'^(Kind|Language|Position|Align|Size|Line)\s*:', line, re.IGNORECASE):
            continue
        # Strip HTML tags: <c>, <i>, <00:00:01.234>, etc.
        line = re.sub(r'<[^>]+>', '', line).strip()
        if line and (not seen or seen[-1] != line):
            seen.append(line)
    return ' '.join(seen).strip()


def _get_captions(info: dict) -> str:
    """Download and parse VTT captions from yt-dlp info for any language."""
    auto = info.get('automatic_captions') or {}
    manual = info.get('subtitles') or {}

    # Priority: video's own declared language → common variants → anything available
    primary = info.get('language') or ''
    seen_langs: list[str] = []
    if primary:
        seen_langs.append(primary)
    for lang in ['en', 'en-US', 'en-GB']:
        if lang not in seen_langs:
            seen_langs.append(lang)
    for lang in list(manual.keys()) + list(auto.keys()):
        if lang not in seen_langs:
            seen_langs.append(lang)

    for lang in seen_langs[:_MAX_CAPTION_TRIES]:
        formats = manual.get(lang) or auto.get(lang)
        if not formats:
            continue
        vtt_url = next((f['url'] for f in formats if f.get('ext') == 'vtt'), None)
        if not vtt_url:
            vtt_url = next((f['url'] for f in formats if f.get('url')), None)
        if not vtt_url:
            continue
        try:
            resp = httpx.get(vtt_url, timeout=_CAPTION_TIMEOUT, follow_redirects=True, headers=_BROWSER_HEADERS)
        except Exception:
            continue
        # YouTube rate-limits the timedtext endpoint per-IP. Once we hit 429 every
        # other language will 429 too — stop and let the caller fall back to the
        # description so the save still succeeds quickly.
        if resp.status_code == 429:
            logger.warning("[CAPTIONS] 429 from YouTube timedtext — falling back to description")
            break
        if resp.status_code == 200:
            parsed = _parse_vtt(resp.text)
            if len(parsed) > 30:
                return parsed
    return ''


def _og(html: str, prop: str) -> str:
    """Pull an Open Graph value. Scans individual <meta> tags (each naturally
    bounded by '>') and reads content from the matching one. Avoids the
    catastrophic regex backtracking the old whole-document DOTALL pattern hit on
    huge minified pages — Instagram ships ~600 KB of inline script with no clean
    <head>, which made the old pattern hang for tens of seconds."""
    target = f"og:{prop}".lower()
    for m in re.finditer(r'<meta\s[^>]*>', html, re.IGNORECASE):
        tag = m.group(0)
        # Match the property/name attribute EXACTLY. A loose substring check let
        # sub-properties masquerade as the base one — e.g. Facebook's
        # 'og:image:alt' (caption text) was returned for 'og:image', so the
        # thumbnail ended up being the title string instead of the image URL.
        pm = re.search(r'(?:property|name)\s*=\s*["\']([^"\']+)["\']', tag, re.IGNORECASE)
        if not pm or pm.group(1).strip().lower() != target:
            continue
        # DOTALL is safe here: it runs on one small <meta> tag, not the whole page —
        # and it's required because captions (e.g. Instagram recipes) span newlines.
        cm = re.search(r'content=["\'](.*?)["\']', tag, re.IGNORECASE | re.DOTALL)
        if cm:
            return unescape(cm.group(1).strip())
    return ''


def _extract_jsonld(html: str) -> dict:
    """Pull articleBody/headline from JSON-LD blocks. LinkedIn posts expose the
    FULL post text here (og:description is heavily truncated)."""
    for block in re.findall(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, re.IGNORECASE | re.DOTALL):
        try:
            data = json.loads(block.strip())
        except Exception:
            continue
        for d in (data if isinstance(data, list) else [data]):
            if not isinstance(d, dict):
                continue
            body = (d.get('articleBody') or d.get('text') or '').strip()
            head = (d.get('headline') or '').strip()
            if body or head:
                return {'articleBody': body, 'headline': head}
    return {}


# og:/JSON-LD link-preview metadata lives in <head>; cap how much HTML we regex
# over so a huge page (e.g. YouTube's ~1 MB watch page) can't make the DOTALL
# patterns crawl for tens of seconds and blow the extraction timeout.
_MAX_PAGE_PARSE_BYTES = 600_000


def _youtube_oembed(url: str) -> dict:
    """YouTube's public oEmbed endpoint: title / author / thumbnail. It is NOT
    behind the player-API bot-block, so it still answers from datacenter IPs when
    full extraction is refused — our free graceful-degradation path for YouTube."""
    try:
        resp = httpx.get(
            "https://www.youtube.com/oembed",
            params={"url": url, "format": "json"},
            headers=_BROWSER_HEADERS,
            timeout=8,
            follow_redirects=True,
        )
        if resp.status_code == 200:
            d = resp.json()
            return {
                "title": (d.get("title") or "").strip(),
                "uploader": (d.get("author_name") or "").strip(),
                "image": (d.get("thumbnail_url") or "").strip(),
            }
    except Exception:
        pass
    return {}


def _extract_from_page(url: str) -> dict:
    """Fetch text from a page via JSON-LD (full body) then Open Graph meta tags.
    Best-effort — returns empty fields on failure."""
    try:
        # Bounded client: a login-walled page (e.g. Instagram) can otherwise send us
        # down a slow redirect chain and hang the whole save. Cap redirects + timeout.
        with httpx.Client(follow_redirects=True, max_redirects=3, timeout=8.0, headers=_PREVIEW_HEADERS) as client:
            resp = client.get(url)
        page = resp.text[:_MAX_PAGE_PARSE_BYTES]
    except Exception:
        return {}

    ld = _extract_jsonld(page)
    # Prefer the full JSON-LD article body; fall back to og:description.
    description = ld.get('articleBody') or _og(page, 'description')
    title = ld.get('headline') or _og(page, 'title')
    image = _og(page, 'image')

    if not title:
        m = re.search(r'<title[^>]*>(.*?)</title>', page, re.IGNORECASE | re.DOTALL)
        title = unescape(m.group(1).strip()) if m else ''

    # og:title can be the entire caption (Instagram dumps the whole recipe in it).
    # Keep just the first line, capped, so the card title stays short and readable.
    clean_title = re.sub(r'\s*\|\s*LinkedIn\s*$', '', title).strip()
    # Facebook prefixes a reel's og:title with engagement counts, e.g.
    # "205K views · 800 reactions | Real title" — strip that noise.
    clean_title = re.sub(
        r'^[\d.,kmb]+\s+(?:views?|reactions?|likes?|comments?|shares?)\b.*?\|\s*',
        '', clean_title, flags=re.IGNORECASE,
    )
    clean_title = clean_title.split('\n', 1)[0].strip()
    if len(clean_title) > 90:
        clean_title = clean_title[:90].rsplit(' ', 1)[0] + '…'

    return {
        "title": clean_title,
        "description": description,
        "image": image,
    }


_BASE_YDL_OPTS = {
    "quiet": True,
    "no_warnings": True,
    "skip_download": True,
    "socket_timeout": 10,        # seconds per network operation
    "retries": 1,
    "extractor_retries": 1,
    "noplaylist": True,
    "ignoreerrors": False,
}


def _youtube_attempts() -> list[dict]:
    """
    Ordered extraction strategies for YouTube. We prefer the ios/tv/android
    innertube clients because they return auto-captions (the web client does
    NOT) and respond in ~2s. The default client chain is the last-resort
    fallback. Combined with process=False (no format selection), this is both
    far faster and far more reliable than the default behavior.
    """
    return [
        {**_BASE_YDL_OPTS, "extractor_args": {"youtube": {
            "player_client": ["ios", "tv", "android"],
        }}},
        {**_BASE_YDL_OPTS},   # yt-dlp's own default client chain
    ]


def _run_ydl(url: str, opts: dict) -> Optional[dict]:
    # process=False returns the raw extractor output (metadata + caption tracks)
    # WITHOUT running format selection — which we don't need and which is the slow,
    # failure-prone step ("Requested format is not available").
    with yt_dlp.YoutubeDL(opts) as ydl:
        return ydl.extract_info(url, download=False, process=False)


def _pick_thumbnail(info: dict, platform: str) -> str:
    """Best available thumbnail. process=False may not set 'thumbnail' directly."""
    if info.get("thumbnail"):
        return info["thumbnail"]
    best, best_area = "", -1
    for t in (info.get("thumbnails") or []):
        u = t.get("url")
        if not u:
            continue
        area = (t.get("width") or 0) * (t.get("height") or 0)
        if area >= best_area:
            best, best_area = u, area
    if not best and platform == "youtube" and info.get("id"):
        best = f"https://i.ytimg.com/vi/{info['id']}/hqdefault.jpg"
    return best


def extract_info(url: str) -> dict:
    platform = detect_platform(url)

    attempts = _youtube_attempts() if platform == "youtube" else [_BASE_YDL_OPTS]

    ydl_info = None
    last_err: Optional[Exception] = None
    for i, opts in enumerate(attempts):
        try:
            ydl_info = _run_ydl(url, opts)
            if ydl_info:
                if i > 0:
                    logger.info(f"[EXTRACT] {url} succeeded on fallback attempt #{i + 1}")
                break
        except Exception as e:
            last_err = e
            logger.warning(f"[EXTRACT] attempt #{i + 1} failed for {url}: {type(e).__name__}: {e}")
            continue

    if ydl_info:
        title = ydl_info.get("title") or ""
        description = ydl_info.get("description") or ""
        transcript = _get_captions(ydl_info)
        best_text = transcript or description
        thumb = _pick_thumbnail(ydl_info, platform)
        # yt-dlp with process=False can return a truthy but EMPTY shell for gated
        # platforms — notably Facebook reels yield a dict with no title, thumbnail
        # or text. Trusting it here short-circuits the public-og: fallback below,
        # which DOES read the title/thumbnail/caption via the crawler UA. So only
        # take this path when yt-dlp actually produced something; otherwise fall
        # through to the page-meta / oEmbed fallbacks.
        if title or thumb or best_text.strip():
            return {
                "title": title,
                "caption": description,
                "transcript": transcript,
                "best_text": best_text,
                "thumbnail_url": thumb,
                "duration": int(ydl_info.get("duration") or 0),
                "platform": platform,
                "uploader": ydl_info.get("uploader") or "",
                "needs_audio": not best_text or len(best_text.strip()) < 40,
                # Only "extracted" (cacheable / not junk) if we actually got something.
                "extracted": bool((best_text or "").strip()) or bool(thumb),
            }
        logger.info(f"[EXTRACT] yt-dlp returned an empty shell for {url} — using page-meta fallback")

    if last_err:
        logger.error(f"[EXTRACT] all yt-dlp attempts failed for {url}: {type(last_err).__name__}: {last_err}")

    # yt-dlp failed. Graceful degradation depends on the platform:
    #
    # YouTube's watch page is huge and gated ("prove you're not a bot" on datacenter
    # IPs). Don't regex-parse it — use the lightweight public oEmbed endpoint, which
    # still answers from datacenter IPs and gives a clean title + thumbnail. We lose
    # the transcript (the gated part), but the save degrades to a real bookmark
    # instead of timing out or failing.
    if platform == "youtube":
        meta = _youtube_oembed(url)
        title = meta.get("title") or ""
        thumb = meta.get("image") or ""
        return {
            "title": title or "YouTube Short",
            "caption": "",
            "transcript": "",
            "best_text": "",
            "thumbnail_url": thumb,
            "duration": 0,
            "platform": platform,
            "uploader": meta.get("uploader") or "",
            "needs_audio": False,
            # True when even oEmbed gave nothing — i.e. fully blocked / private.
            "blocked": not (title or thumb),
            "login_required": not (title or thumb),
            # Cache the bookmark-grade result so re-saving is instant.
            "extracted": bool(title or thumb),
        }

    # All platforms fall back to public page meta. The facebookexternalhit UA serves
    # the ungated link-preview surface — for LinkedIn this returns the FULL post body
    # via JSON-LD (~2.5k chars in practice), so no paid scraper is needed.
    meta = _extract_from_page(url)
    title = meta.get("title") or ""
    description = meta.get("description") or ""
    best_text = description

    return {
        "title": title or f"{platform.capitalize()} Post",
        "caption": description,
        "transcript": "",
        "best_text": best_text,
        "thumbnail_url": meta.get("image") or "",
        "duration": 0,
        "platform": platform,
        "uploader": "",
        "needs_audio": False,
        "login_required": not best_text,
        # Cache page extractions that actually yielded text (e.g. LinkedIn via JSON-LD).
        "extracted": len((best_text or "").strip()) >= 50,
    }


# Hard ceiling on audio downloads. Short-form clips are well under this; the cap
# stops a malformed/abusive URL from pulling a huge file and burning disk + bandwidth.
_MAX_AUDIO_BYTES = 50 * 1024 * 1024  # 50 MB


def download_audio(url: str) -> Optional[str]:
    """Download audio to a temp mp3 file. Returns file path or None on failure."""
    tmp_dir = tempfile.mkdtemp()
    output_path = os.path.join(tmp_dir, "audio.%(ext)s")

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "format": "bestaudio/best",
        "outtmpl": output_path,
        "socket_timeout": 15,
        "max_filesize": _MAX_AUDIO_BYTES,   # abort before downloading anything larger
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "96",
        }],
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        audio_file = os.path.join(tmp_dir, "audio.mp3")
        return audio_file if os.path.exists(audio_file) else None
    except Exception:
        return None
