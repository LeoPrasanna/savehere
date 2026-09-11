/** node --experimental-strip-types --no-warnings components/tabBarSize.test.ts
 *
 * Invoked directly from .github/workflows/mobile-ci.yml, NOT as an npm script —
 * @expo/fingerprint hashes package.json's scripts block. See mobile/AGENTS.md.
 */
import assert from 'node:assert/strict';
import { tabBarSize, MIN_SLOT, MAX_SLOT, MAX_BAR } from './tabBarSize.ts';

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

// A tablet must hit the ceiling and centre, not stretch into a runway.
assert.equal(pad.slot, MAX_SLOT);
assert.equal(pad.maxWidth, MAX_BAR);

// Six slots plus chrome have to actually fit the screen they were measured for.
for (const [w, s] of [[375, se], [393, std], [430, max]] as const) {
  const used = s.slot * 6 + (6 + 6 + 1 + 1 + 2 * 4) + (6 + 6 + 1 + 1) + G;
  assert.ok(used <= w + 1, `bar ${used} overflows a ${w}pt screen`);
}

// Icons stay proportional rather than marooned in a bigger circle.
assert.ok(max.icon > se.icon);
assert.ok(se.icon >= 18 && max.icon <= 27, `${se.icon}..${max.icon} off scale`);

// Absurd inputs must not produce absurd bars (a folded phone, a split view).
assert.equal(tabBarSize(0, G).slot, MIN_SLOT);
assert.equal(tabBarSize(200, G).slot, MIN_SLOT);

console.log(`tabBarSize: ok (SE ${se.slot} / 393 ${std.slot} / ProMax ${max.slot} / iPad ${pad.slot})`);
