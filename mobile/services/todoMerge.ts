// Type-only: this module must stay importable by plain Node for its test —
// a value import of ./api would drag in React Native and fail to resolve.
import type { Todo } from './api';

/**
 * Reconcile a fresh server list with the two things the client knows and the
 * server doesn't yet.
 *
 * The to-do screen defers deletes for a grace period and lets the user take one
 * back. That leaves two facts the server has no idea about:
 *
 *   dropId    a row the user deleted moments ago. The DELETE has not been sent
 *             (that is the whole point of the grace window), so the server still
 *             returns it — and without this it would flicker back into the list.
 *
 *   restored  rows the user brought back with Undo. `listTodos` is called with
 *             the user's `showCompleted` preference, so a COMPLETED task with
 *             completed items hidden is legitimately absent from the response.
 *             Undo put it on screen; every later refetch took it away again.
 *             That is the bug this exists to close.
 *
 * The two are mirrors: one holds a row OUT, the other holds a row IN. Keeping
 * them in one pure function is what makes them testable — see todoMerge.test.ts,
 * which encodes the exact reported repro.
 */
export function mergeTodoList(
  serverItems: Todo[],
  opts: { dropId?: string | null; restored?: ReadonlyMap<string, Todo> } = {},
): Todo[] {
  const { dropId, restored } = opts;

  let items = dropId ? serverItems.filter(t => t.id !== dropId) : serverItems.slice();

  if (restored && restored.size > 0) {
    const present = new Set(items.map(t => t.id));
    for (const [id, todo] of restored) {
      // A restored row that the server DID return needs nothing — the server's
      // copy is fresher than the snapshot we held.
      if (!present.has(id)) items.push(todo);
    }
  }

  return items;
}
