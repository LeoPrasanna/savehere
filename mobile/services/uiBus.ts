import { useEffect, useRef } from 'react';

/**
 * A tiny event bus for the UI signals that cross screen boundaries.
 *
 * Exists because the app chrome — the floating tab bar and the hamburger — is
 * rendered ONCE at the root, above the router, but has to reach state that
 * lives inside a route or inside a sibling component:
 *
 *   openProfile      the hamburger lives in a dozen headers; the panel it opens
 *                    is rendered once at the root. Without this, every screen
 *                    would need its own copy of the panel (which is exactly
 *                    what it used to have, and why the panel's state was
 *                    duplicated three ways).
 *   libraryState     `app/index.tsx` renders EITHER the landing or the library,
 *                    decided by a session flag it only reads at mount. The Home
 *                    and Library tabs change that flag from outside the route,
 *                    so the screen needs telling.
 *   dismissOverlays  the app is going away (backgrounded, or a share just
 *                    arrived) — every open modal and sheet should close.
 *   appResumed       the app came back to the foreground; anything showing
 *                    server data is now potentially stale.
 *
 * Deliberately NOT a state library. Four events do not justify a context
 * provider or a store. ponytail: this is the ceiling the original note named —
 * the NEXT event is the signal to reach for something real, and the shape it
 * wants is a payload-carrying emitter, not five more zero-arg names.
 */

/**
 *   dismissOverlays  ⚠️ THE OVERLAYS ARE `Modal`s, i.e. their OWN native
 *                    windows — so the share overlay in _layout.tsx, which is an
 *                    absolutely positioned sibling View, can never cover them.
 *                    No amount of zIndex fixes that. The only way to get one
 *                    off the screen is to tell it to close, which is what this
 *                    is for.
 *
 *                    It replaced `closeProfile`, which was the same idea aimed
 *                    at exactly one component. That was wrong twice over: the
 *                    panel was only ever one of EIGHT modals in the app (the
 *                    to-do editor, the category picker, the workout notice…),
 *                    and it was emitted only on a fresh URL-bearing share — so
 *                    leaving the app any other way left everything on screen,
 *                    which is what the owner reported on 2026-08-14. The
 *                    emitter must not have to know the inventory, hence one
 *                    broadcast that every overlay owner subscribes to.
 *
 *   appResumed       Android delivers a background share without ever entering
 *                    the JS process, and returning to a still-running app is
 *                    NOT a router focus event — so `useFocusEffect` never
 *                    fires and the library keeps showing its pre-share list
 *                    until the user pulls to refresh. This is the trigger that
 *                    was missing.
 */
type Event = 'openProfile' | 'libraryState' | 'dismissOverlays' | 'appResumed';

const subs: Record<Event, Set<() => void>> = {
  openProfile: new Set(),
  libraryState: new Set(),
  dismissOverlays: new Set(),
  appResumed: new Set(),
};

/** Subscribe. Returns an unsubscribe function, for the effect cleanup. */
export function onUi(e: Event, fn: () => void): () => void {
  subs[e].add(fn);
  return () => { subs[e].delete(fn); };
}

export function emitUi(e: Event) {
  subs[e].forEach(fn => fn());
}

/**
 * Close this overlay when the app goes away.
 *
 * One line per overlay owner, which is irreducible: each `visible` flag is a
 * `useState` private to the component that renders it, and there is no provider
 * to hoist them into. The ref indirection means the caller can pass an inline
 * arrow without resubscribing on every render.
 *
 * ⚠️ `OnboardingModal` deliberately does NOT use this. It has no dismiss by
 * design — closing it without running `finish()` would burn the first-run tour
 * without stamping the "seen" flag, so the user would never see it again.
 */
export function useDismissOnBackground(close: () => void) {
  const latest = useRef(close);
  latest.current = close;
  useEffect(() => onUi('dismissOverlays', () => latest.current()), []);
}
