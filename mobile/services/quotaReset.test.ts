/**
 * Run: npm run test:quota
 *
 * The only thing worth pinning here is the DAY arithmetic. Everything else is
 * string formatting you can read; "is this today or tomorrow" is the part that
 * breaks silently, and it breaks for the users furthest from UTC — which is
 * most of this app's users.
 */
import assert from 'node:assert';
import { resetsAtLabel, resumesAtSentence } from './quotaReset.ts';

/** A local-time Date, so these cases mean the same thing in every timezone the
 *  test might run in. The formatter reads local hours; so does this. */
const local = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min);

// ── Day bucketing ───────────────────────────────────────────────────────────
assert.equal(
  resetsAtLabel(local(2026, 8, 14, 17, 30).toISOString(), local(2026, 8, 14, 9, 0)),
  '5:30 PM today',
);
assert.equal(
  resetsAtLabel(local(2026, 8, 15, 5, 30).toISOString(), local(2026, 8, 14, 22, 0)),
  '5:30 AM tomorrow',
);
// 23:00 → 01:00 is two hours apart and still a different day. A naive
// "difference < 24h means today" check gets this wrong.
assert.equal(
  resetsAtLabel(local(2026, 8, 15, 1, 0).toISOString(), local(2026, 8, 14, 23, 0)),
  '1:00 AM tomorrow',
);
assert.equal(
  resetsAtLabel(local(2026, 8, 18, 5, 30).toISOString(), local(2026, 8, 14, 9, 0)),
  '5:30 AM on Tuesday',
);
// A reset that has just passed reads as today, never as yesterday — cached
// usage is allowed to be a few minutes stale.
assert.equal(
  resetsAtLabel(local(2026, 8, 13, 5, 30).toISOString(), local(2026, 8, 14, 9, 0)),
  '5:30 AM today',
);

// ── 12-hour clock edges ─────────────────────────────────────────────────────
assert.equal(resetsAtLabel(local(2026, 8, 14, 0, 0).toISOString(), local(2026, 8, 14, 0, 0)), '12:00 AM today');
assert.equal(resetsAtLabel(local(2026, 8, 14, 12, 5).toISOString(), local(2026, 8, 14, 9, 0)), '12:05 PM today');
assert.equal(resetsAtLabel(local(2026, 8, 14, 9, 7).toISOString(), local(2026, 8, 14, 9, 0)), '9:07 AM today');

// ── Missing / junk degrades to blank, never to a guessed time ───────────────
assert.equal(resetsAtLabel(null), '');
assert.equal(resetsAtLabel(undefined), '');
assert.equal(resetsAtLabel(''), '');
assert.equal(resetsAtLabel('not-a-date'), '');

// ── The shared sentence still says something true with no timestamp ─────────
assert.match(resumesAtSentence(null), /after the daily reset/);
// ⚠️ `now` is passed EXPLICITLY. This line originally omitted it, so it read the
// real system clock: it asserted "tomorrow", passed on the day it was written,
// and failed the next morning when that same timestamp became "today". Every
// assertion in this file must pin both ends of the comparison or it is a test
// that fails on a calendar, not on a regression.
assert.match(
  resumesAtSentence(local(2026, 8, 15, 5, 30).toISOString(), local(2026, 8, 14, 22, 0)),
  /come back at 5:30 AM tomorrow\./,
);

console.log('quotaReset: all assertions passed');
