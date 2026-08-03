import assert from 'node:assert/strict';
import { mergeTodoList } from './todoMerge.ts';
import type { Todo } from './api';

/**
 * Run with:  npm run test:todos
 *
 * No framework on purpose. This pins ONE thing — the reconciliation in
 * `todoMerge.ts` — because that is where two reported bugs actually lived and
 * where a future refactor is most likely to quietly undo the fix.
 */

const todo = (id: string, completed = false): Todo => ({
  id,
  reel_id: null,
  title: id,
  description: null,
  priority: 'medium',
  due_date: null,
  completed,
  completed_at: null,
  completed_on: null,
  created_at: null,
});

const ids = (list: Todo[]) => list.map(t => t.id).sort();

/* ── the delete grace window ─────────────────────────────────────────────── */

// The server still returns a row whose DELETE hasn't been sent yet.
assert.deepEqual(
  ids(mergeTodoList([todo('a'), todo('b')], { dropId: 'b' })),
  ['a'],
  'a row inside its grace window must not flicker back',
);

assert.deepEqual(
  ids(mergeTodoList([todo('a'), todo('b')], {})),
  ['a', 'b'],
  'with nothing pending the server list passes through untouched',
);

/* ── THE REPORTED BUG ────────────────────────────────────────────────────────
   Add a task, mark it completed, delete it, press Undo. With "show completed"
   OFF the server legitimately omits it, so every refetch dropped the row the
   user had just restored — it came back and then vanished.                   */

const done = todo('c', true);

assert.deepEqual(
  ids(mergeTodoList([todo('a')], { restored: new Map([['c', done]]) })),
  ['a', 'c'],
  'an undone COMPLETED task survives a refetch that omits it',
);

// …and it must survive repeatedly, not just the first time. The earlier fix
// only skipped one refetch, which moved the disappearance rather than fixing it.
for (let i = 0; i < 5; i++) {
  assert.deepEqual(
    ids(mergeTodoList([todo('a')], { restored: new Map([['c', done]]) })),
    ['a', 'c'],
    'still there on refetch ' + (i + 1),
  );
}

/* ── no duplicates, and the server wins ──────────────────────────────────── */

const fresher = { ...done, title: 'edited on another device' };
const merged = mergeTodoList([todo('a'), fresher], { restored: new Map([['c', done]]) });
assert.equal(merged.filter(t => t.id === 'c').length, 1, 'a restored row is never duplicated');
assert.equal(
  merged.find(t => t.id === 'c')!.title,
  'edited on another device',
  "the server's copy wins over the client's snapshot",
);

/* ── the two guards compose ──────────────────────────────────────────────── */

assert.deepEqual(
  ids(mergeTodoList([todo('a'), todo('b')], {
    dropId: 'b',
    restored: new Map([['c', done]]),
  })),
  ['a', 'c'],
  'one row held out and another held in, in the same pass',
);

// Deleting something previously restored is handled by the CALLER retracting it
// from the map (see `remove` in app/todos.tsx). Verify the shape that produces.
assert.deepEqual(
  ids(mergeTodoList([todo('a')], { dropId: 'c', restored: new Map() })),
  ['a'],
  're-deleting a restored row leaves it gone',
);

console.log('todoMerge: all assertions passed');
