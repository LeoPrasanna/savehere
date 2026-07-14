/**
 * In-memory, session-scoped UI flags. Module-level so they survive screen
 * remounts, but deliberately NOT persisted: they reset on app restart and are
 * cleared on auth changes (see AuthContext) so a newly signed-in user gets the
 * fresh-start flow (Landing first), not the previous user's navigation state.
 */

let enteredLibrary = false;

// Set just before an accent switch remounts the tree, so the screen that owns
// the ProfilePanel reopens it and the user can keep trying colors.
let reopenPanel = false;

export function hasEnteredLibrary(): boolean {
  return enteredLibrary;
}

export function markEnteredLibrary(): void {
  enteredLibrary = true;
}

export function markReopenPanel(): void {
  reopenPanel = true;
}

/** One-shot: returns whether the panel should reopen, and clears the flag. */
export function consumeReopenPanel(): boolean {
  const v = reopenPanel;
  reopenPanel = false;
  return v;
}

export function resetSessionFlags(): void {
  enteredLibrary = false;
  reopenPanel = false;
}
