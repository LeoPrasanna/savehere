/** node --experimental-strip-types --no-warnings services/saveQuota.test.ts
 *
 * Invoked directly from .github/workflows/mobile-ci.yml, NOT as an npm script —
 * @expo/fingerprint hashes package.json's scripts block. See mobile/AGENTS.md.
 */
import assert from 'node:assert/strict';
import { saveQuota } from './saveQuota.ts';

// ── The real caps: 50 free, 500 trial/pro ────────────────────────────────────
// FREE
assert.equal(saveQuota(44, 50).level, 'ok');
assert.equal(saveQuota(45, 50).level, 'warn');        // 90%
assert.equal(saveQuota(47, 50).level, 'warn');
assert.equal(saveQuota(48, 50).level, 'critical');    // 95% of 50 is 47.5
assert.equal(saveQuota(50, 50).level, 'full');
assert.equal(saveQuota(71, 50).level, 'full');        // grandfathered over the cap

// PRO
assert.equal(saveQuota(449, 500).level, 'ok');
assert.equal(saveQuota(450, 500).level, 'warn');
assert.equal(saveQuota(475, 500).level, 'critical');
assert.equal(saveQuota(500, 500).level, 'full');

// ⚠️ The ratios are the reason both of the above work from one implementation.
// The thresholds were written for a 1000 cap that lasted about an hour; these
// assert they still land correctly at 1000 and at a small arbitrary limit, so a
// future change to SAVE_LIMIT cannot strand them.
assert.equal(saveQuota(900, 1000).level, 'warn');
assert.equal(saveQuota(950, 1000).level, 'critical');
assert.equal(saveQuota(180, 200).level, 'warn');
assert.equal(saveQuota(190, 200).level, 'critical');
assert.equal(saveQuota(100, 200).level, 'ok');

// Remaining is what the critical message promises.
assert.equal(saveQuota(48, 50).remaining, 2);
assert.match(saveQuota(48, 50).message, /2 more/);
assert.equal(saveQuota(50, 50).remaining, 0);

// This band is one line on the library screen; Pro is mentioned in the
// once-per-session alert and in the server's own 403, not here.
for (const [u, l] of [[45, 50], [48, 50], [50, 50], [475, 500]] as const) {
  assert.doesNotMatch(saveQuota(u, l).message, /pro|upgrade|subscri/i, `upsell leaked at ${u}/${l}`);
}

// Unknowns must stay quiet rather than render a scary zero-based ratio.
assert.equal(saveQuota(null, 50).level, 'ok');
assert.equal(saveQuota(500, null).level, 'ok');
assert.equal(saveQuota(undefined, undefined).level, 'ok');
assert.equal(saveQuota(5, 0).level, 'ok');
assert.equal(saveQuota(0, 50).message, '');

console.log('saveQuota: ok');
