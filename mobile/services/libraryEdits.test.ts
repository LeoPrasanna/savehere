import assert from 'node:assert/strict';
import { mergeLibrary } from './libraryEdits.ts';
import type { Reel } from './api';

/**
 * Run with:  npm run test:library
 *
 * No framework on purpose. This pins the reconciliation that makes optimistic
 * delete and instant category changes safe against `app/index.tsx`'s
 * `useFocusEffect` refetch — which is the exact thing that makes a deleted card
 * flicker back if it is wrong.
 */

const reel = (id: string, category = 'other'): Reel => ({
  id,
  url: `https://x/${id}`,
  platform: 'instagram',
  title: id,
  thumbnail_url: null,
  summary: [],
  tags: [],
  category,
  notes: null,
  summary_status: 'ready',
  created_at: null,
} as unknown as Reel);

const ids = (list: Reel[]) => list.map(r => r.id);

/* ── the in-flight delete ─────────────────────────────────────────────────── */

// The whole reason this module exists: the server still returns a row whose
// DELETE has not landed yet.
assert.deepEqual(
  ids(mergeLibrary([reel('a'), reel('b')], { deleted: new Set(['b']) })),
  ['a'],
  'a card whose delete is in flight must not flicker back',
);

assert.deepEqual(
  ids(mergeLibrary([reel('a'), reel('b')], {})),
  ['a', 'b'],
  'with nothing pending the server list passes through untouched',
);

assert.deepEqual(
  ids(mergeLibrary([reel('a')], { deleted: new Set(['gone']) })),
  ['a'],
  'an id the server no longer returns is simply absent, not an error',
);

/* ── local patches ────────────────────────────────────────────────────────── */

const patched = mergeLibrary(
  [reel('a', 'other'), reel('b', 'tech')],
  { patched: new Map([['a', { category: 'cooking' }]]) },
);
assert.equal(patched[0].category, 'cooking', 'the category you just picked wins');
assert.equal(patched[1].category, 'tech', 'other cards are untouched');

// Identity matters: ReelCard is memoised, and handing it a new object for every
// row on every refetch would re-render the entire grid.
const rows = [reel('a'), reel('b')];
const passthrough = mergeLibrary(rows, { patched: new Map() });
assert.equal(passthrough[0], rows[0], 'unpatched rows keep their identity');

/* ── the two together ─────────────────────────────────────────────────────── */

const both = mergeLibrary(
  [reel('a', 'other'), reel('b'), reel('c')],
  { deleted: new Set(['b']), patched: new Map([['a', { category: 'travel' }]]) },
);
assert.deepEqual(ids(both), ['a', 'c']);
assert.equal(both[0].category, 'travel');

// A patch on a row that is also being deleted must not resurrect it.
assert.deepEqual(
  ids(mergeLibrary([reel('a')], {
    deleted: new Set(['a']),
    patched: new Map([['a', { category: 'travel' }]]),
  })),
  [],
  'delete beats patch',
);

console.log('libraryEdits: all assertions passed');
