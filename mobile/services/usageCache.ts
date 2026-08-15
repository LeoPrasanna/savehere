import { api, Usage, setMutationHook } from './api';

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
/** A refresh was asked for while one was already running — see refreshUsage. */
let restale = false;

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
  // ⚠️ SHARING THE IN-FLIGHT PROMISE IS NOT THE SAME AS SERVING THE CALLER.
  //
  // Deduping was written for two screens asking the same question at the same
  // moment. It behaves very differently for a caller asking because something
  // CHANGED: an AI action that lands while a refresh is in flight gets handed
  // that older request's result — a snapshot taken before the spend — and the
  // spend is then invisible until something else triggers a fetch. This is not
  // hypothetical now that every write calls in here (see api.ts's mutation
  // hook); an action fired during the 50s cold-start fetch would vanish.
  //
  // So a request arriving mid-flight still shares the promise (nobody waits
  // twice), but it also marks the result as already out of date and re-runs
  // once. Collapses any number of concurrent writes into exactly one follow-up.
  //
  // ponytail: no self-check covers this branch. The services/ tests run under
  // plain `node --experimental-strip-types`, and this module imports `./api`,
  // which pulls in supabase and cannot load outside React Native. Making it
  // testable means injecting the fetcher — an abstraction that would exist only
  // for the test. If this race ever misbehaves, that injection is the fix.
  if (inFlight) { restale = true; return inFlight; }
  inFlight = api.getUsage()
    .then(u => {
      cached = u;
      listeners.forEach(fn => fn(u));
      return u;
    })
    .catch(() => null)
    .finally(() => {
      inFlight = null;
      if (restale) { restale = false; refreshUsage(); }
    });
  return inFlight;
}

/**
 * Every successful write re-reads the budget and the counts. Registered at
 * import time — `contexts/AuthContext` imports this module on app start, which
 * is what makes the wiring live.
 */
setMutationHook(() => { void refreshUsage(); });

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
