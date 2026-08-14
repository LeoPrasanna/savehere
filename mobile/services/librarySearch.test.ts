/**
 * Run:  npm run test:search
 *
 * These are the cases the deleted server-side ranker was tuned against
 * (backend/tests/test_smart_search.py, gone with commit 090a51a). They are
 * pinned here because each one is a real reported failure, not a hypothetical:
 * the category miss, the plural, the typo, the stopword-only query.
 */
import assert from 'node:assert/strict';
import { buildIndex, searchIndex, queryTerms } from './librarySearch.ts';
import type { Reel } from './api';

const reel = (over: Partial<Reel> & { id: string }): Reel => ({
  url: `https://x/${over.id}`,
  platform: 'instagram',
  title: null,
  thumbnail_url: null,
  uploader: null,
  duration: null,
  summary: [],
  tags: [],
  category: 'other',
  summary_status: 'ready',
  notes: null,
  summarize_count: 0,
  tasks_count: 0,
  workout_count: 0,
  is_sensitive: false,
  created_at: '2026-08-01T00:00:00Z',
  ...over,
} as Reel);

const LIBRARY = [
  reel({ id: 'chest', title: 'Chest workout at home', category: 'fitness', tags: ['upper body'] }),
  reel({ id: 'pasta', title: 'One-pot creamy pasta', category: 'cooking', tags: ['recipe', 'dinner'] }),
  reel({ id: 'tokyo', title: '10 days in Japan', category: 'travel', tags: ['tokyo', 'kyoto'] }),
  reel({ id: 'rust', title: 'Why Rust is fast', category: 'tech', summary: ['Ownership avoids a garbage collector'] }),
  reel({ id: 'notes', title: 'Untitled clip', category: 'other', notes: 'the sourdough starter needs 12 hours' }),
];
const INDEX = buildIndex(LIBRARY);

const ids = (q: string) => searchIndex(q, INDEX).map(r => r.id);

// ── The bug the whole ranker exists for ─────────────────────────────────────
// "Fitness finds nothing but chestwork works": the old LIKE search never looked
// at the category, so a fitness reel titled "Chest workout" was invisible.
assert.deepEqual(ids('fitness'), ['chest']);
// …and the natural-phrase form of the same query reduces to its topic.
assert.deepEqual(ids('any videos on fitness'), ['chest']);

// ── Synonyms both directions ────────────────────────────────────────────────
assert.deepEqual(ids('gym'), ['chest'], 'gym must reach the fitness category');
assert.ok(ids('recipe').includes('pasta'));
assert.ok(ids('cooking').includes('pasta'));

// ── Plurals and prefixes ────────────────────────────────────────────────────
assert.ok(ids('recipes').includes('pasta'), 'plural folds to singular');
assert.ok(ids('past').includes('pasta'), 'prefix matches while you are still typing');

// ── One typo still finds it ─────────────────────────────────────────────────
assert.ok(ids('wrokout').includes('chest'), 'one transposition in a long word');
assert.ok(ids('travle').includes('tokyo'));
// …but a short word is NOT fuzzy-matched: one edit changes its meaning.
assert.ok(!ids('rest').includes('rust'), 'short words must not fuzzy-match');

// ── Body fields are searchable, and rank below titles ───────────────────────
assert.ok(ids('sourdough').includes('notes'), 'notes are searchable');
assert.ok(ids('ownership').includes('rust'), 'summary bullets are searchable');
{
  // "workout" is in one title and (via nothing) nowhere else — a title/category
  // hit must outrank a body-only hit for the same term.
  const lib = [
    reel({ id: 'body-only', title: 'Morning routine', summary: ['then a short workout'] }),
    reel({ id: 'titled', title: 'Full workout', category: 'fitness' }),
  ];
  assert.deepEqual(
    searchIndex('workout', buildIndex(lib)).map(r => r.id),
    ['titled', 'body-only'],
  );
}

// ── Ties keep the caller's order (newest first) ─────────────────────────────
{
  const lib = [
    reel({ id: 'newer', title: 'Pasta night', category: 'cooking' }),
    reel({ id: 'older', title: 'Pasta night', category: 'cooking' }),
  ];
  assert.deepEqual(searchIndex('pasta', buildIndex(lib)).map(r => r.id), ['newer', 'older']);
}

// ── Empty / noise queries return nothing, never everything ──────────────────
assert.deepEqual(ids(''), []);
assert.deepEqual(ids('   '), []);
assert.deepEqual(ids('!!!'), []);
assert.deepEqual(ids('zzzznothingmatches'), []);
// A query of pure stopwords falls back to the words THEMSELVES rather than
// becoming an empty term set — an empty term set would have matched the whole
// library, so "the" would look like "show everything". It stays a literal
// search: only the one reel whose notes actually contain the word comes back.
assert.deepEqual(queryTerms('the the').size, 1);
assert.deepEqual(ids('the the'), ['notes']);

// ── A reel with null everything must never throw ────────────────────────────
{
  const bare = buildIndex([reel({ id: 'bare', title: null, category: null as any, tags: null as any, summary: null as any })]);
  assert.deepEqual(searchIndex('anything', bare), []);
}

// ── The scan stays instant at library scale ─────────────────────────────────
{
  const many = Array.from({ length: 2000 }, (_, i) =>
    reel({
      id: `r${i}`,
      title: `Save number ${i} about cooking and travel`,
      category: i % 2 ? 'cooking' : 'travel',
      summary: ['a fairly long summary bullet that adds a realistic number of body tokens to scan'],
    }));
  const idx = buildIndex(many);
  const started = Date.now();
  for (let i = 0; i < 20; i++) searchIndex('cooking recipe', idx);
  const perQuery = (Date.now() - started) / 20;
  assert.ok(perQuery < 25, `20 queries over 2000 reels averaged ${perQuery}ms — the scan has stopped being instant`);
}

console.log('librarySearch: all assertions passed');
