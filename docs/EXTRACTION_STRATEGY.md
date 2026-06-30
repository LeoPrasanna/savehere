# SaveHere — Extraction Proxy & Fallback Strategy

## The Problem

YouTube and Instagram block datacenter IPs (Railway, Render, Fly.io, AWS, etc.) with bot detection. When yt-dlp runs from a datacenter, YouTube returns "Sign in to confirm you're not a bot." This is a **critical production issue** — users will save-and-fail, leading to 1-star reviews and App Store rejection.

## The Goal

Achieve >95% save success rate across all platforms with a layered extraction gateway that gracefully degrades when a layer fails.

## Layered Extraction Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    EXTRACTION GATEWAY                        │
│                                                              │
│  Layer 1: Cache Hit (instant, no network)                   │
│      ↓ miss                                                   │
│  Layer 2: Client-side oEmbed / Open Graph (user's IP)       │
│      ↓ fail / insufficient                                   │
│  Layer 3: yt-dlp + Residential Proxy (transcript + meta)    │
│      ↓ blocked / fail                                         │
│  Layer 4: Managed API Fallback (Apify / YouTube Data API)   │
│      ↓ fail / rate limited                                    │
│  Layer 5: Async Queue + Link-Only Save (never fails)        │
└─────────────────────────────────────────────────────────────┘
```

## Layer 1: Extraction Cache

**Status:** ✅ Already implemented (`extraction_cache` table with 14-day TTL)

**How it works:**
- Any URL that has been saved before hits the cache instantly
- No network request, no yt-dlp, no API cost
- Cache survives reel deletion (so re-saving is instant)

**Improvements:**
- Increase TTL to 30 days for popular URLs
- Add a Redis/Memcached layer in front of SQLite for faster cache lookups at scale

## Layer 2: Client-Side oEmbed / Open Graph

**Status:** ⚠️ Partially implemented (page fallback exists but doesn't use user's IP)

**How it works:**
- The *mobile app* itself fetches oEmbed/OG metadata using the user's own IP address
- The app sends the fetched metadata to the backend instead of the backend doing the scraping
- This bypasses datacenter IP blocks because the request comes from the user's residential/mobile IP

**Implementation:**
```typescript
// In the mobile app, before calling POST /save
async function fetchMetadata(url: string) {
  // Try oEmbed first
  const oembed = await fetch(`https://www.youtube.com/oembed?url=${url}&format=json`);
  if (oembed.ok) return { type: 'oembed', data: await oembed.json() };
  
  // Fallback to OG scraping
  const og = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  // Parse Open Graph tags from HTML
}
```

**Pros:** Free, uses user's IP, works for most public pages
**Cons:** Doesn't get transcripts for YouTube; only gets title + thumbnail + description
**When to use:** As a fast fallback when yt-dlp fails; enough for a basic summary

## Layer 3: yt-dlp + Residential Proxy

**Status:** ❌ Not implemented — this is the primary production fix

**How it works:**
- Run yt-dlp through a residential/mobile proxy so the IP appears as a real home user
- The proxy rotates IPs to avoid rate limiting

**Recommended Providers:**

| Provider | Type | Price | Notes |
|----------|------|-------|-------|
| **Bright Data** | Residential | ~$5.04/GB | Best for YouTube; extensive proxy pool |
| **Oxylabs** | Residential | ~$8/GB | Good for Instagram; dedicated account manager |
| **Smartproxy** | Residential | ~$7/GB | Cheaper option; 55M+ IPs |
| **ScraperAPI** | Managed | $49/mo | Handles proxies + rotation; simpler integration |
| **ZenRows** | Managed | $49/mo | Built-in anti-bot; good for Instagram |

**Implementation:**
```python
# In the backend extractor
import yt_dlp

ydl_opts = {
    'proxy': f'http://{PROXY_USER}:{PROXY_PASS}@ residential.smartproxy.com:10000',
    'socket_timeout': 15,
    # ... existing options
}
```

**Cost estimation:**
- Average YouTube Short extraction: ~2-5 MB of data
- At $5/GB (Bright Data): ~$0.01-0.025 per save
- At 1000 saves/day: ~$10-25/day in proxy costs
- This must be covered by subscription revenue (hence the per-user AI quota and paid tiers)

**When to use:** Primary extraction method for YouTube and TikTok when cache misses

## Layer 4: Managed API Fallback

**Status:** ⚠️ Partially researched (Apify was tested and rejected for LinkedIn)

**YouTube Data API v3 (for captions + metadata):**
- Cost: Free tier = 10,000 quota units/day
- `videos.list` = 1 unit, `captions.list` = 50 units, `captions.download` = 200 units
- A full extraction (metadata + captions) = ~251 units
- Free tier supports ~40 full extractions/day
- Paid tier: $1 per 10,000 units beyond free quota

**Implementation:**
```python
from googleapiclient.discovery import build

youtube = build('youtube', 'v3', developerKey=YOUTUBE_API_KEY)
response = youtube.videos().list(part='snippet,contentDetails', id=video_id).execute()
```

**Apify (for Instagram):**
- Instagram scrapers are available but cost ~$0.025/post and take 30-60 seconds
- Too slow for the synchronous save path; could be used for async backfill

**When to use:** When yt-dlp + proxy fails or for platforms that are harder to scrape (Instagram Reels)

## Layer 5: Async Queue + Link-Only Save

**Status:** ✅ Already partially implemented (background summary runs in BackgroundTask)

**How it works:**
- If all extraction layers fail, the app never fails the user
- Save the URL as a "link-only bookmark" immediately
- Queue an async background job to retry extraction with different methods
- Once extraction succeeds, update the summary status from "pending" to "ready"
- The user sees the card in their library immediately with a "Summary coming soon" label

**Improvements:**
- Add a Celery / RQ queue for reliable background processing (instead of FastAPI BackgroundTask which is lost on restart)
- Implement exponential backoff retry (try again in 1 min, 5 min, 15 min, 1 hour)
- Send a push notification when the backfill summary is ready

## Recommended Implementation Order

### Phase 1: Launch (Minimum Viable)
1. **Enable client-side oEmbed** in the mobile app (Layer 2)
2. **Add a cheap residential proxy** (Smartproxy or ScraperAPI) for yt-dlp (Layer 3)
3. **Budget for proxy costs** in the per-user AI quota model
4. **Monitor success rates** by platform and alert if YouTube drops below 90%

### Phase 2: Post-launch (Scale & Reliability)
1. **Implement YouTube Data API v3** as a dedicated caption fallback (Layer 4)
2. **Add Celery/RQ** for durable background extraction retries (Layer 5)
3. **Add per-platform success rate dashboards** and automated alerting
4. **Consider a distributed extraction pool** across multiple residential proxies and regions

## Monitoring & Alerting

Add these metrics to Sentry or a custom dashboard:

```python
# In the save endpoint
metrics = {
    "platform": platform,
    "extraction_method": method_used,  # cache, oembed, ytdlp, proxy, api, async
    "success": True/False,
    "duration_ms": elapsed,
    "cache_hit": True/False,
}
```

**Alert thresholds:**
- YouTube success rate < 90% → PagerDuty/Slack alert
- Average save duration > 5 seconds → investigate
- Proxy cost per save > $0.05 → review proxy provider

## Cost-Benefit Summary

| Layer | Cost per Save | Reliability | Implementation Effort |
|-------|---------------|-------------|----------------------|
| Cache | $0.00 | 100% (if hit) | ✅ Done |
| Client oEmbed | $0.00 | 70% (basic meta) | Low |
| yt-dlp + Proxy | $0.01-0.03 | 95% | Medium |
| YouTube API | $0.00-0.01 | 99% | Medium |
| Async backfill | $0.00 | 100% (never fails) | ✅ Partially done |

**Bottom line:** A $0.01-0.03 per-save extraction cost is sustainable at the planned subscription price of $4.99/month. The key is the cache (instant, free) and the proxy (handles the hard cases).

## Decision Required Before Launch

**You must choose ONE of these before deploying:**

1. **Budget for a residential proxy** (~$50-200/month initially, scaling with users)
2. **Accept lower YouTube success rates** and rely on client-side oEmbed + async backfill
3. **Use YouTube Data API v3** for all YouTube content (limited free quota, needs paid tier for scale)

**Recommendation:** Option 1 (proxy) + Option 3 (YouTube API as fallback) for the highest reliability. The cost is small relative to the subscription revenue and the user experience is significantly better.
