/** node --experimental-strip-types --no-warnings components/tabBarSize.test.ts
 *
 * Invoked directly from .github/workflows/mobile-ci.yml, NOT as an npm script —
 * @expo/fingerprint hashes package.json's scripts block. See mobile/AGENTS.md.
 */
import assert from 'node:assert/strict';
import { tabBarSize, MIN_SLOT, MAX_SLOT } from './tabBarSize.ts';

// gutter = 16+16 page padding + 8 gap between the pill and the Ask capsule.
const G = 40;

const se = tabBarSize(375, G);        // iPhone SE / 13 mini
const std = tabBarSize(393, G);       // iPhone 15/16
const max = tabBarSize(430, G);       // iPhone 16 Pro Max — the reported case
const pad = tabBarSize(1024, G);      // iPad

// The whole point: a bigger phone gets a bigger bar.
assert.ok(max.slot > se.slot, `Pro Max ${max.slot} should beat SE ${se.slot}`);
assert.ok(std.slot >= se.slot);

// Never smaller than the old fixed size — this may only ever grow the target.
for (const s of [se, std, max, pad]) {
  assert.ok(s.slot >= MIN_SLOT, `slot ${s.slot} under the 42pt floor`);
  assert.ok(s.slot <= MAX_SLOT, `slot ${s.slot} over the ${MAX_SLOT}pt ceiling`);
}

// ── The iPad bug (owner, 2026-09-11) ────────────────────────────────────────
// The bar sat flush LEFT on a 1024pt screen and centred on every phone. Two
// causes: the row used alignSelf:'stretch' (a stretched item that meets its
// max-width lands at the START of the cross axis), and maxWidth was a flat 560
// holding ~390pt of content. The alignment half is CSS; this asserts the half
// that is arithmetic — maxWidth must describe the CONTENT, not a magic number.
assert.equal(pad.slot, MAX_SLOT);
const naturalWidth = MAX_SLOT * 6 + (6 + 6 + 1 + 1 + 2 * 4) + (6 + 6 + 1 + 1);
assert.equal(pad.maxWidth, naturalWidth,
  `an iPad bar must be as wide as its contents (${naturalWidth}), not a constant`);
assert.ok(pad.maxWidth < 1024 - G,
  'the cap has to be under the screen, or there is nothing left to centre');

// On a phone the cap must NOT shrink the bar — it should still fill the width,
// which is the whole point of the Pro Max fix. Allow one slot of rounding
// slack: the slot is floored, so six of them can leave up to 5pt unused.
for (const [w, s] of [[375, se], [393, std], [430, max]] as const) {
  const available = w - G;
  assert.ok(s.maxWidth <= available, `cap ${s.maxWidth} exceeds ${available} on ${w}`);
  assert.ok(s.maxWidth >= available - 6, `cap ${s.maxWidth} strands ${available - s.maxWidth}pt on ${w}`);
}

// Six slots plus chrome have to actually fit the screen they were measured for.
for (const [w, s] of [[375, se], [393, std], [430, max], [1024, pad]] as const) {
  const used = s.slot * 6 + (6 + 6 + 1 + 1 + 2 * 4) + (6 + 6 + 1 + 1) + G;
  assert.ok(used <= w + 1, `bar ${used} overflows a ${w}pt screen`);
  assert.equal(s.maxWidth + G >= used, true);
}

// Icons stay proportional rather than marooned in a bigger circle.
assert.ok(max.icon > se.icon);
assert.ok(se.icon >= 18 && max.icon <= 27, `${se.icon}..${max.icon} off scale`);

// Absurd inputs must not produce absurd bars (a folded phone, a split view).
assert.equal(tabBarSize(0, G).slot, MIN_SLOT);
assert.equal(tabBarSize(200, G).slot, MIN_SLOT);

console.log(
  `tabBarSize: ok (SE ${se.slot}/${se.maxWidth} · 393 ${std.slot}/${std.maxWidth} · ` +
  `ProMax ${max.slot}/${max.maxWidth} · iPad ${pad.slot}/${pad.maxWidth})`
);
