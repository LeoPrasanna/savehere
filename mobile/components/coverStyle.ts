/**
 * Which cover a reel gets. Pure arithmetic, no React and no react-native — same
 * split as `rollGeometry.ts`, and for the same reason: this is the part with a
 * right answer, so it is the part that gets a self-check.
 *
 * See components/GeneratedCover.tsx for what the numbers mean visually.
 */

/** Ramps are light → mid → deep. The deep stop lands low so the card's existing
 *  scrim always has near-black under the title. */
export const RAMPS: readonly (readonly [string, string, string])[] = [
  ['#B88067', '#663925', '#211109'],  // ember
  ['#B8678D', '#662543', '#210914'],  // orchid
  ['#876BB8', '#3F2866', '#130A21'],  // iris
  ['#67A6B8', '#255866', '#091C21'],  // tide
  ['#6DB890', '#2A6646', '#0B2115'],  // fern
  ['#96A3B8', '#4B5666', '#171B21'],  // slate
  ['#B89F6B', '#665228', '#211A0A'],  // amber
  ['#AD6BB8', '#5E2866', '#1E0A21'],  // plum
];

export const DIRECTIONS = [
  { start: { x: 0.25, y: 0 }, end: { x: 0.75, y: 1 } },
  { start: { x: 0.75, y: 0 }, end: { x: 0.25, y: 1 } },
] as const;

/** Glyph centres, all in the upper field so the title band stays clean. */
export const ANCHORS = [
  { x: 0.26, y: 0.3 }, { x: 0.74, y: 0.26 },
  { x: 0.5, y: 0.2 }, { x: 0.3, y: 0.46 },
] as const;

/**
 * 32-bit string hash.
 *
 * ⚠️ `Math.imul` here is a preference, NOT a correctness fix — and the
 * distinction matters, because `aspectFor` in ReelCard.tsx does the same job
 * with plain `h * 31`. An earlier version of this comment claimed that form
 * loses precision; it does not. `>>> 0` bounds `h` below 2^32 on every
 * iteration, so `h * 31` peaks around 2^37 and stays exact in float64
 * (verified: 0 disagreements over 200,000 ids).
 *
 * ⚠️ SO DO NOT "FIX" `aspectFor` TO MATCH. It is not broken, and changing its
 * hash would reshuffle every tile's aspect ratio in an existing library —
 * a whole grid silently relayouts for no reason.
 */
export function hash32(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  return h;
}

export interface CoverStyle {
  ramp: readonly [string, string, string];
  direction: (typeof DIRECTIONS)[number];
  anchor: (typeof ANCHORS)[number];
}

/**
 * ⚠️ EACH FIELD READS A DIFFERENT SHIFT OF THE HASH. Reading the same low bits
 * for all three would correlate them — every "ember" tile would also share one
 * anchor and one gradient angle, and the wall would show its seams.
 */
export function coverStyle(id: string): CoverStyle {
  const h = hash32(id || 'x');
  return {
    ramp: RAMPS[(h >>> 3) % RAMPS.length],
    direction: DIRECTIONS[(h >>> 17) & 1],
    anchor: ANCHORS[(h >>> 11) % ANCHORS.length],
  };
}
