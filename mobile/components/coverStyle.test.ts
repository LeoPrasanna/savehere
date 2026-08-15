/**
 * Self-check for the generated-cover bucketing.
 *   node --experimental-strip-types --no-warnings components/coverStyle.test.ts
 *
 * No framework, matching the other services/ and components/ checks.
 */
import assert from 'node:assert/strict';
import { coverStyle, hash32, RAMPS, ANCHORS, DIRECTIONS } from './coverStyle.ts';

// Real uuid shapes — the ids these actually see.
const ids = Array.from({ length: 3000 }, (_, i) =>
  `${(i * 2654435761 >>> 0).toString(16).padStart(8, '0')}-4b1c-4f2a-9d3e-${i.toString(16).padStart(12, '0')}`,
);

/* ── Deterministic ────────────────────────────────────────────────────────── */
// The whole premise: a library that reshuffled its own covers between launches
// would feel broken in a way a static one never does.
for (const id of ids.slice(0, 50)) {
  const a = coverStyle(id);
  const b = coverStyle(id);
  assert.equal(a.ramp, b.ramp);
  assert.equal(a.anchor, b.anchor);
  assert.equal(a.direction, b.direction);
}

/* ── Every bucket is reachable ────────────────────────────────────────────── */
// A shift that happens to be constant over real ids would silently collapse the
// whole palette to one colour, and nothing else would catch it.
const rampsSeen = new Set(ids.map(id => coverStyle(id).ramp));
const anchorsSeen = new Set(ids.map(id => coverStyle(id).anchor));
const dirsSeen = new Set(ids.map(id => coverStyle(id).direction));
assert.equal(rampsSeen.size, RAMPS.length, 'not every ramp is reachable');
assert.equal(anchorsSeen.size, ANCHORS.length, 'not every anchor is reachable');
assert.equal(dirsSeen.size, DIRECTIONS.length, 'not every direction is reachable');

/* ── Roughly even ─────────────────────────────────────────────────────────── */
// Not a statistics test — just enough to catch a shift that piles 80% of the
// library onto one colour, which reads as "the app only has one cover".
const counts = new Map<unknown, number>();
for (const id of ids) counts.set(coverStyle(id).ramp, (counts.get(coverStyle(id).ramp) ?? 0) + 1);
const expected = ids.length / RAMPS.length;
for (const [, n] of counts) {
  assert.ok(n > expected * 0.5 && n < expected * 1.5, `ramp distribution is lopsided: ${n} vs ~${expected}`);
}

/* ── The three fields are independent ─────────────────────────────────────── */
// ⚠️ THE BUG THIS EXISTS FOR: reading the same bits for ramp and anchor makes
// every ember tile share one glyph position. Both would still look "random"
// on their own; only the pairing shows it.
const pairs = new Set(ids.map(id => {
  const c = coverStyle(id);
  return `${RAMPS.indexOf(c.ramp as any)}:${ANCHORS.indexOf(c.anchor as any)}`;
}));
assert.equal(pairs.size, RAMPS.length * ANCHORS.length, 'ramp and anchor are correlated');

/* ── Hash hygiene ─────────────────────────────────────────────────────────── */
assert.equal(hash32(''), 0);
assert.ok(Number.isInteger(hash32('abc')) && hash32('abc') >= 0);
// Stays a uint32 over a long id. (NOT a claim that `h * 31` would overflow —
// it wouldn't; see the note on hash32. This only pins the return contract.)
assert.ok(hash32('x'.repeat(400)) <= 0xFFFFFFFF);
// An empty id must not throw — `coverStyle('')` falls back to a fixed seed.
assert.ok(coverStyle('').ramp);

console.log('coverStyle: all checks passed');
