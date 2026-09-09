import assert from 'node:assert/strict';
import { cardTitle } from './cardTitle.ts';

// Short titles are left completely alone — most YouTube/TikTok titles are these.
assert.equal(cardTitle('Rule of thirds explained'), 'Rule of thirds explained');
assert.equal(cardTitle(''), '');
assert.equal(cardTitle(null), '');
assert.equal(cardTitle(undefined), '');

// The LinkedIn case this exists for: a whole sentence, kept whole, no ellipsis
// because nothing was dropped mid-thought.
assert.equal(
  cardTitle('I built an AI resume screener in a weekend. Here is everything I learned about prompt design.'),
  'I built an AI resume screener in a weekend',
);

// No sentence break in budget -> cut on a space, never mid-word, and SAY so.
const noStop = cardTitle('Three things hiring managers at the engineering org look for when they read your CV carefully');
assert.ok(noStop.endsWith('…'), noStop);
assert.ok(noStop.length <= 66, noStop);
assert.ok(!noStop.includes('  '));
// The last word must be whole: what remains before the ellipsis is a prefix of
// the source ending at a word boundary.
const body = noStop.slice(0, -1);
assert.ok(' Three things hiring managers at the engineering org look for when they read your CV carefully'.includes(' ' + body.split(' ').slice(-1)[0] + ' '), body);

// An early full stop is a fragment, not a title — don't cut at "Wow."
const fragment = cardTitle('Wow. This one framing trick completely changed how I shoot every single interview clip');
assert.notEqual(fragment, 'Wow');
assert.ok(fragment.length > 24, fragment);

// Newlines and runs of whitespace collapse rather than surviving into the card.
assert.equal(cardTitle('  Two   lines\nof   title  '), 'Two lines of title');

console.log('cardTitle: all assertions passed');
