// Type-only: this module must stay importable by plain Node for its test —
// a value import of ./api would drag in React Native and fail to resolve.
import type { Reel } from './api';

/**
 * What the client knows about the library that the server does not yet.
 *
 * ⚠️ WHY THIS HAS TO EXIST. `app/index.tsx` re-fetches the whole library in a
 * `useFocusEffect`, so every return from a reel screen replaces local state
 * with the server's list. That makes optimistic edits *unsafe* on their own:
 * delete a save, come back, and the server — which has not processed the DELETE
 * yet — hands the card straight back. It reappears, then vanishes on the next
 * refresh. The to-do list hit exactly this and solved it the same way
 * (`todoMerge.ts`); this is that pattern for reels.
 *
 * Two facts are held:
 *
 *   deleted   ids whose DELETE is in flight. Held OUT of any server list until
 *             the request settles. Cleared on failure so the row honestly comes
 *             back rather than being hidden by a delete that never happened.
 *
 *   patched   fields the user just changed (category, today) and the server has
 *             confirmed, but which this screen's cached list predates. Held IN,
 *             so the card shows the category you picked instead of the one you
 *             replaced. Self-expiring: once a server row agrees, the patch is
 *             dropped, so a later change from anywhere else is never masked by
 *             a stale local override.
 *
 * Process-scoped on purpose. None of this is worth persisting — a cold start
 * re-reads the server, which is the truth.
 */

const deleted = new Set<string>();
const patched = new Map<string, Partial<Reel>>();

export function markDeleted(id: string) {
  deleted.add(id);
}

/** The DELETE failed — stop hiding the row so the user sees the real state. */
export function unmarkDeleted(id: string) {
  deleted.delete(id);
}

export function patchReel(id: string, fields: Partial<Reel>) {
  patched.set(id, { ...patched.get(id), ...fields });
}

/** Sign-out / account deletion: the next user must not inherit these. */
export function clearLibraryEdits() {
  deleted.clear();
  patched.clear();
}

/**
 * Pure, so the reconciliation is testable without a device — see
 * `libraryEdits.test.ts`. `applyEdits` below is the stateful wrapper screens use.
 */
export function mergeLibrary(
  server: Reel[],
  opts: { deleted?: ReadonlySet<string>; patched?: ReadonlyMap<string, Partial<Reel>> } = {},
): Reel[] {
  const drop = opts.deleted;
  const patches = opts.patched;
  const kept = drop && drop.size > 0 ? server.filter(r => !drop.has(r.id)) : server.slice();
  if (!patches || patches.size === 0) return kept;
  return kept.map(r => {
    const p = patches.get(r.id);
    return p ? { ...r, ...p } : r;
  });
}

/**
 * True once every field in `patch` matches the server's row — the server has
 * caught up and the local override is now noise.
 *
 * ⚠️ SCALAR FIELDS ONLY (`category`, `title`, `notes`…). This compares by
 * `===`, so patching an ARRAY field like `tags` would never settle: the server
 * returns a fresh array every fetch, the comparison is always false, and the
 * local value would mask that field forever — including a later change made by
 * a re-summarize. Patch the scalar, let the array come from the server.
 */
function settled(row: Reel, patch: Partial<Reel>): boolean {
  return (Object.keys(patch) as (keyof Reel)[]).every(k => row[k] === patch[k]);
}

/**
 * Apply what we know to a freshly fetched list.
 *
 * Also retires patches the server has caught up on. That retirement is the
 * difference between "the card updates instantly" and "the card is frozen on a
 * value nothing can ever change" — without it, a category later rewritten by a
 * re-summarize would be permanently masked by the user's older local edit.
 */
export function applyEdits(server: Reel[]): Reel[] {
  if (patched.size > 0) {
    for (const row of server) {
      const p = patched.get(row.id);
      if (p && settled(row, p)) patched.delete(row.id);
    }
  }
  return mergeLibrary(server, { deleted, patched });
}
