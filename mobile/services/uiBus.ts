/**
 * A tiny event bus for the two UI signals that cross screen boundaries.
 *
 * Exists because the app chrome — the floating tab bar and the hamburger — is
 * rendered ONCE at the root, above the router, but has to reach state that
 * lives inside a route or inside a sibling component:
 *
 *   openProfile   the hamburger lives in a dozen headers; the panel it opens is
 *                 rendered once at the root. Without this, every screen would
 *                 need its own copy of the panel (which is exactly what it used
 *                 to have, and why the panel's state was duplicated three ways).
 *   libraryState  `app/index.tsx` renders EITHER the landing or the library,
 *                 decided by a session flag it only reads at mount. The Home and
 *                 Library tabs change that flag from outside the route, so the
 *                 screen needs telling.
 *
 * Deliberately NOT a state library. Two events do not justify a context
 * provider or a store. If this grows past four or five, that is the signal to
 * reach for something real.
 */

/**
 *   closeProfile  a share arrived from another app and the panel is open.
 *                 ⚠️ The panel is a `Modal`, i.e. its OWN native window — so
 *                 the share overlay in _layout.tsx, which is an absolutely
 *                 positioned sibling View, can never cover it. No amount of
 *                 zIndex fixes that. The only way to get the panel off the
 *                 screen is to tell it to close, which is what this is for.
 */
type Event = 'openProfile' | 'closeProfile' | 'libraryState';

const subs: Record<Event, Set<() => void>> = {
  openProfile: new Set(),
  closeProfile: new Set(),
  libraryState: new Set(),
};

/** Subscribe. Returns an unsubscribe function, for the effect cleanup. */
export function onUi(e: Event, fn: () => void): () => void {
  subs[e].add(fn);
  return () => { subs[e].delete(fn); };
}

export function emitUi(e: Event) {
  subs[e].forEach(fn => fn());
}
