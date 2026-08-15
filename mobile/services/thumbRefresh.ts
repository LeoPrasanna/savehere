import { api } from './api';

/**
 * Repair a tile whose preview image will never load again.
 *
 * ⚠️ WHY THIS IS NEEDED AT ALL, measured rather than assumed (2026-08-15):
 * Instagram's CDN links are SIGNED and carry an `oe=<hex>` expiry. A scan of the
 * real library found saves whose thumbnail died about **five days** after the
 * save — the stored URL returns 403 forever after that. No amount of client-side
 * retrying helps, because the URL itself is dead. YouTube is unaffected
 * (`i.ytimg.com` is unsigned), which is exactly why the owner saw it as
 * "sometimes": it is Instagram-shaped, not random.
 *
 * The same call also repairs the other half of the bug — reels whose extraction
 * failed at save time and never had a thumbnail at all.
 *
 * ⚠️ ONE ATTEMPT PER REEL PER APP SESSION. A library grid can mount dozens of
 * broken tiles at once, and each repair is a real page fetch on the server. This
 * module is the thing standing between "a few images fix themselves" and "the
 * grid DDoSes our own backend on every scroll". Deliberately in-memory: a failed
 * repair should be retried on the next launch, when the post may be public again.
 *
 * ⚠️ It also caps how many repairs run at once, so a cold-start grid does not
 * open 24 sockets. Anything over the cap simply isn't attempted this session —
 * the tile keeps its honest empty frame, which is what it showed before.
 *
 * ⚠️ DELIBERATE EXCEPTION TO "A CARD MUST NOT CALL THE API" (see ReelCard's
 * delete note). That rule exists because a card cannot honestly REPORT a
 * failure — a swallowed delete looked like success. It does not apply here:
 * this call is non-destructive, and its failure state is the empty frame the
 * tile was already showing. Routing it through the screen would mean threading
 * a callback through three different grids to fix a picture.
 */

/** Reels already attempted this session — success or failure, once either way. */
const attempted = new Set<string>();
/** ponytail: a plain counter, not a queue. If repairs ever need ordering or
 *  retry-after, that is the point to reach for something real. */
let inFlight = 0;
const MAX_CONCURRENT = 3;
const MAX_PER_SESSION = 40;

export function canRefreshThumb(reelId: string): boolean {
  return (
    !!reelId &&
    !attempted.has(reelId) &&
    inFlight < MAX_CONCURRENT &&
    attempted.size < MAX_PER_SESSION
  );
}

/**
 * Ask the server for a current thumbnail URL. Resolves to the new URL, or null
 * if there isn't one (private/deleted post, offline, or we're over the caps).
 *
 * Never rejects — a broken picture must not surface an error to the user.
 */
export async function refreshThumb(reelId: string): Promise<string | null> {
  if (!canRefreshThumb(reelId)) return null;
  attempted.add(reelId);
  inFlight++;
  try {
    const reel = await api.refreshThumbnail(reelId);
    return reel.thumbnail_url || null;
  } catch {
    return null;
  } finally {
    inFlight--;
  }
}

/** Sign-out: the next account's tiles must not inherit this one's attempts. */
export function clearThumbRefreshes(): void {
  attempted.clear();
  inFlight = 0;
}
