/** node --experimental-strip-types --no-warnings services/saveQuota.test.ts
 *
 * Invoked directly from .github/workflows/mobile-ci.yml, NOT as an npm script —
 * @expo/fingerprint hashes package.json's scripts block. See mobile/AGENTS.md.
 */
import assert from 'node:assert/strict';
import { saveQuota } from './saveQuota.ts';

// The owner's numbers, against the real 1000 cap.
assert.equal(saveQuota(899, 1000).level, 'ok');
assert.equal(saveQuota(900, 1000).level, 'warn');
assert.equal(saveQuota(949, 1000).level, 'warn');
assert.equal(saveQuota(950, 1000).level, 'critical');
assert.equal(saveQuota(999, 1000).level, 'critical');
assert.equal(saveQuota(1000, 1000).level, 'full');
assert.equal(saveQuota(1400, 1000).level, 'full');   // grandfathered over the cap

// The thresholds are ratios, so a different server cap still warns in time.
// Hardcoding 900 against a limit of 200 would refuse a save with no warning.
assert.equal(saveQuota(180, 200).level, 'warn');
assert.equal(saveQuota(190, 200).level, 'critical');
assert.equal(saveQuota(100, 200).level, 'ok');

// Remaining is what the critical message promises.
assert.equal(saveQuota(963, 1000).remaining, 37);
assert.match(saveQuota(963, 1000).message, /37 more/);
assert.equal(saveQuota(1000, 1000).remaining, 0);

// Nothing here sells anything — the cap is identical on every tier now.
for (const n of [900, 950, 1000]) {
  assert.doesNotMatch(saveQuota(n, 1000).message, /pro|upgrade|subscri/i, `upsell leaked at ${n}`);
}

// Unknowns must stay quiet rather than render a scary zero-based ratio.
assert.equal(saveQuota(null, 1000).level, 'ok');
assert.equal(saveQuota(500, null).level, 'ok');
assert.equal(saveQuota(undefined, undefined).level, 'ok');
assert.equal(saveQuota(5, 0).level, 'ok');
assert.equal(saveQuota(0, 1000).message, '');

console.log('saveQuota: ok');
