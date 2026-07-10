/**
 * In-memory, session-scoped UI flags. Module-level so they survive screen
 * remounts, but deliberately NOT persisted: they reset on app restart and are
 * cleared on auth changes (see AuthContext) so a newly signed-in user gets the
 * fresh-start flow (Landing first), not the previous user's navigation state.
 */

let enteredLibrary = false;

export function hasEnteredLibrary(): boolean {
  return enteredLibrary;
}

export function markEnteredLibrary(): void {
  enteredLibrary = true;
}

export function resetSessionFlags(): void {
  enteredLibrary = false;
}
