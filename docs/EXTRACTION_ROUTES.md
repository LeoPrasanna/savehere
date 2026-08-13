# Where captions actually come from (2026-08-13)

Researched and **measured**, not inferred. This file exists so nobody re-runs
the investigation, and — more importantly — so nobody "fixes" Instagram by
reaching for a paid proxy that is no longer needed.

> The governing lesson: **the problem was never parsing, it was which URL we
> asked for.** Instagram serves the normal web page to a residential IP and
> refuses it to a datacenter one, so the old path worked in every local test and
> returned nothing from Render every single time. Local success proves nothing —
> see the standing gotcha in [`TODO.md`](../TODO.md).

---

## The live routes (both verified working FROM RENDER)

### Instagram — `/reel/<code>/embed/captioned/`

```
GET https://www.instagram.com/reel/<shortcode>/embed/captioned/
User-Agent: SaveHere/1.0 (+https://savehere.app)
```

The iframe Instagram hands to any site embedding a post. It **has** to carry
the caption for embeds to render, so it is served without cookies, without a
token, to any honest non-empty User-Agent.

**Verified from Render 2026-08-13:** `probe_text_len` went **0 → 255**, status
`degraded → ok`, latency **3583ms → 1521ms** (128 KB response vs a 605 KB page
that was failing anyway).

Implementation: `extractor.instagram_embed()`.

⚠️ Two traps, both already fixed and both pinned by tests:
- The caption `<div>` is prefixed with the **username**. Left in, the handle is
  the first thing the summarizer reads as content — split out as `uploader`.
- The capture regex must consume the rest of the opening tag (`[^>]*>`), or an
  **empty** caption div yields `">"` instead of `""` — truthy, clears an
  emptiness check, and sends an angle bracket to Claude as a caption. An empty
  div is the clean "private or deleted" signal.

⚠️ UA matrix: Chrome → 200/605KB. `facebookexternalhit`, `python-requests`,
`curl`, `SaveHere/1.0` → 200/128KB. **Empty UA → 302.** Any honest non-empty UA
works, and a non-browser UA is four times cheaper.

### Facebook — `graph.facebook.com/v25.0/oembed_video`

```
GET https://graph.facebook.com/v25.0/oembed_video?url=https://www.facebook.com/watch/?v=<id>
```

Tokenless since **2026-06-15**. No app, no App Review, no token. The only route
here that is *published and sanctioned* rather than merely tolerated.

⚠️ **THE URL FORM MATTERS.** `facebook.com/reel/<id>` returns an **empty
blockquote** with no description and does not even validate the id.
`/watch/?v=<id>` returns the full text. `facebook_oembed()` normalizes first;
a test pins the rewrite.

⚠️ **UNVERIFIED FOR REELS.** Confirmed against a live public FB *video*
(`835321340249928`). No live public FB *reel* id was available, so reel-ID
interchangeability with `/watch/?v=` is **[Likely], not [Certain]**. Settle it
with one call the moment a public FB reel URL exists:
`GET /health/extract?live=1&url=<fb-reel-url>`.

---

## Dead ends — do not spend time here again

| Option | Status |
|---|---|
| `instagram_oembed` (tokenless) | **Alive but useless.** Returns embed chrome only — `version, provider_name, provider_url, type, width, html`. `thumbnail_url`/`author_name` removed 2025-11-03. **Never returns a caption.** Every blog post celebrating its return describes a door opening onto a wall. |
| Graph API for content you don't own | **Impossible.** Needs Business/Creator + Page + App Review, and even then grants only *your own* media. Not a paperwork problem — the endpoint does not exist. |
| `?__a=1&__d=dis` | Dead — "Page Not Found". |
| `mbasic.facebook.com` | Dead — 302 to `/login/`. |
| `instagram.com/api/v1/media/shortcode/<c>/info/` | Dead — 404. |
| `ddinstagram.com` | 403. `instagramez.com` → 200/0 bytes. `kkinstagram.com` → 6.2MB video passthrough, not metadata. |
| instaloader / instagrapi anonymous | Effectively dead — 401 "please wait", revoked `doc_id`s, 429s. Datacenter IPs blocked before the rate limit. With cookies you risk the account. |
| Paid/freemium middlemen (Apify $5/mo credit no CC, HikerAPI 100 req, Bright Data) | Work, but you inherit their risk and add a dependency for something Meta now serves directly. **Not needed.** |

---

## ToS reality — the honest version

- Both robots.txt files carry: *"Collection of data on Instagram through
  automated means is prohibited unless you have express written permission."*
  Instagram's is an allowlist — `User-agent: *` / `Disallow: /`. **Everything
  except the Facebook oEmbed route is robots-disallowed for us.**
- Meta's [Automated Data Collection Terms](https://www.facebook.com/legal/automated_data_collection_terms)
  permit collected data for *"displaying previews of Meta URLs to your users"* —
  which covers showing a caption in a saved-link view. It does **not** obviously
  cover storing captions long-term and feeding them to an LLM. Known residue.
- Same terms: *"You will only use IP addresses, user-agent strings, and other
  identifiers that identify your services."* ⚠️ **The `facebookexternalhit`
  spoof in `_PREVIEW_HEADERS` is a named violation of the one unambiguous
  clause** — and it does not even work from Render. The routes above need no
  spoofing, which is *why* they are preferred rather than merely additional.
  The spoof still serves LinkedIn/other platforms; retiring it is open work.
- *Meta v. Bright Data* (N.D. Cal., Jan 2024): logged-off scraping of public
  data is not governed by Meta's ToS, because the ToS binds account holders.
  Meta waived appeal. A real shield against contract claims for logged-out
  fetches — **not permission**, and no protection against IP blocking.

---

## How to test any of this again

`/health/extract` was rebuilt for exactly this. `probe_ok` used to pass on a
**thumbnail alone**, which is precisely what a bot-blocked extraction returns —
the one instrument aimed at the problem could not see it.

```bash
curl "https://savehere-api-staging.onrender.com/health/extract?live=1&url=<any supported url>"
```

Reports `probe_text_len`, `probe_link_only`, `probe_login_wall`,
`probe_title_len`, `probe_has_thumbnail` — from **Render's IP**, which is the
only environment whose answer counts. Host-allowlisted (unauthenticated
endpoint making outbound requests) with domain-suffix matching on a dotted
boundary; substring matching was already a real open-proxy bug here once.
