import { api, Reel } from './api';
import { applyEdits } from './libraryEdits';
import { buildIndex, IndexedReel } from './librarySearch';

/**
 * The searchable copy of the whole library, tokenized once and kept in memory.
 *
 * ⚠️ WHY IT IS A CACHE AND NOT A FETCH PER VISIT. Search has to feel instant or
 * it does not get used, and the backend it would otherwise call is a Render
 * free instance with a ~50 s cold start. Paying that once per app session is
 * acceptable; paying it every time someone opens the search screen is not.
 *
 * Same shape as `services/usageCache` deliberately — in-memory only, one
 * in-flight request shared by concurrent callers, never rejects. Copying that
 * module's contract means there is one convention in services/ rather than two.
 *
 * ⚠️ It is NOT persisted. Unlike `saveCount`, this is the user's actual content:
 * a stale disk copy would show saves they deleted on another device, and a
 * search result you cannot open is worse than a slower search.
 *
 * ponytail: fetches the whole library through the existing paginated list
 * endpoint (`limit: 1000`, which is the server's own cap — see list_reels).
 * A dedicated slim `/api/reels/index` route would cut the payload by dropping
 * summaries, but it is a new endpoint to maintain for a payload that is a few
 * hundred KB at the sizes this app has. Add it when a real library makes the
 * fetch measurably slow.
 */

const FETCH_LIMIT = 1000;

let reels: Reel[] | null = null;
let index: IndexedReel[] | null = null;
let inFlight: Promise<IndexedReel[] | null> | null = null;
/** When the cache was built, so a screen can decide it is too old to trust. */
let builtAt = 0;

/** The tokenized library, or null if we have never had a successful fetch. */
export function getLibraryIndex(): IndexedReel[] | null {
  return index;
}

/** How many reels are searchable right now — for the screen's own copy. */
export function indexedCount(): number {
  return reels?.length ?? 0;
}

export function indexAgeMs(): number {
  return builtAt ? Date.now() - builtAt : Infinity;
}

/**
 * Fetch and tokenize. Safe to call from anywhere, as often as you like:
 * concurrent callers share one request.
 *
 * Never rejects — callers that care get `null` and keep whatever they had.
 */
export function refreshLibraryIndex(): Promise<IndexedReel[] | null> {
  if (inFlight) return inFlight;
  inFlight = api.listReels({ limit: FETCH_LIMIT })
    .then(data => {
      // Same reconciliation the library grid uses: a delete still in flight, a
      // category just changed. Without it, searching straight after deleting a
      // card hands that card back.
      reels = applyEdits(data.items);
      index = buildIndex(reels);
      builtAt = Date.now();
      return index;
    })
    .catch(() => null)
    .finally(() => { inFlight = null; });
  return inFlight;
}

/** Sign-out / account deletion. The next person on this device must not be able
 *  to search the previous user's library. */
export function clearLibraryIndex(): void {
  reels = null;
  index = null;
  builtAt = 0;
}
