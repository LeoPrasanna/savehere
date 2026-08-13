import { api, Usage } from './api';

/**
 * The user's account state (tier, AI budget, save/category/platform counts),
 * fetched ONCE AT LOGIN rather than when a screen that needs it opens.
 *
 * ⚠️ WHY: every consumer of `/usage` was fetching on mount or on open, so the
 * first frame of the profile panel, the save screen and the reel screen all
 * showed placeholder numbers and then snapped to the real ones. On a cold
 * Render free-tier instance that gap is ~50 seconds, during which the panel
 * claimed 0 saves and no tier badge. The data does not change per screen —
 * only the moment we happen to ask for it did.
 *
 * So it is fetched when the session appears (see AuthContext) and every screen
 * reads the cache synchronously for its first paint, then refreshes in the
 * background. Nobody waits for something we could already have.
 *
 * ⚠️ IN-MEMORY ONLY, and that is deliberate. Unlike `services/saveCount`, this
 * carries the TIER and the AI budget — numbers the server owns and that change
 * server-side (a purchase, the daily reset, an action spent on another device).
 * Persisting them across launches would let a stale tier badge or a stale
 * "3 left" survive a restart, and a wrong entitlement shown confidently is
 * worse than a blank one shown briefly. A cold start re-fetches.
 */

let cached: Usage | null = null;
let inFlight: Promise<Usage | null> | null = null;

type Listener = (u: Usage) => void;
const listeners = new Set<Listener>();

/** Last known account state, or null if we have never had a successful fetch. */
export function getCachedUsage(): Usage | null {
  return cached;
}

/**
 * Fetch and cache. Safe to call from anywhere, as often as you like:
 * concurrent callers share one request rather than stacking up.
 *
 * Never rejects — usage is informative, and no screen should break because a
 * meter could not be refreshed. Callers that care get `null`.
 */
export function refreshUsage(): Promise<Usage | null> {
  if (inFlight) return inFlight;
  inFlight = api.getUsage()
    .then(u => {
      cached = u;
      listeners.forEach(fn => fn(u));
      return u;
    })
    .catch(() => null)
    .finally(() => { inFlight = null; });
  return inFlight;
}

/**
 * Subscribe to refreshes. Returns an unsubscribe function, matching the
 * `onUi` / `onSchemeChange` convention used elsewhere in services/.
 */
export function onUsage(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Sign-out / account deletion. The next person on this device must not see
 *  the previous user's tier or counts, however briefly. */
export function clearUsage(): void {
  cached = null;
}
