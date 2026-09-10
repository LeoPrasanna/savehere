/** node --experimental-strip-types --no-warnings services/readFailure.test.ts
 *
 * Invoked directly from .github/workflows/mobile-ci.yml, NOT as an npm script —
 * @expo/fingerprint hashes package.json's scripts block and a dev-only script
 * must never cost an EAS build. See the note in that workflow.
 */
import assert from 'node:assert/strict';
import { readFailure } from './readFailure.ts';

// The card that started this: a real title and a real thumbnail, and the app
// still claimed Facebook wanted us to log in.
assert.equal(readFailure({
  platform: 'facebook',
  title: 'You just need discipline 🦅 | Anmol Sharma',
  thumbnail_url: 'https://scontent.xx.fbcdn.net/v/t1.jpg',
}), 'no-caption');

// A genuine wall: the backend's placeholder label and nothing else.
assert.equal(readFailure({
  platform: 'facebook', title: 'Facebook Reel', thumbnail_url: '',
}), 'walled');
assert.equal(readFailure({
  platform: 'linkedin', title: '', thumbnail_url: '',
}), 'walled');

// A thumbnail with no real title is still empty-handed — the wall's own image
// can survive the screen even when its title does not.
assert.equal(readFailure({
  platform: 'facebook', title: 'Facebook Post', thumbnail_url: 'https://x/y.jpg',
}), 'walled');

// Instagram and the rest never get the login message; theirs is the honest
// "this reel is all visuals" case.
assert.equal(readFailure({
  platform: 'instagram', title: 'Instagram Reel', thumbnail_url: '',
}), 'no-text');
assert.equal(readFailure({
  platform: 'instagram', title: 'Chef Prasad', thumbnail_url: 'https://x/y.jpg',
}), 'no-caption');

// Missing fields must not throw — a reel mid-fetch has null everything.
assert.equal(readFailure({}), 'no-text');

console.log('readFailure: ok');
