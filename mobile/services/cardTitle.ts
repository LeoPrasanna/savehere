/**
 * The title a LIBRARY CARD shows — not the title we store.
 *
 * ⚠️ THIS IS A VIEW CONCERN AND IT LIVES HERE ON PURPOSE. The server already
 * cleans titles (strips "| LinkedIn", drops Facebook's engagement-count prefix,
 * keeps the first line, caps at 90) and 90 characters is right for the detail
 * screen and for search. It is wrong for a tile two-to-a-row that gives the
 * title exactly two lines at ~30 characters each: the last word gets guillotined
 * mid-syllable, which is what a LinkedIn post looks like on a card, because a
 * LinkedIn headline is a whole sentence rather than a name (owner report,
 * 2026-09-09).
 *
 * Trimming here rather than at save time is also what fixes the saves you
 * ALREADY have — a stored title cannot be re-cut without re-extracting every
 * reel, and this ships over the air.
 */

/** Two lines of `font.sm` on a half-width tile. Measured against the real grid,
 *  not chosen for roundness — 72 overflows, 56 wastes the second line. */
const CAP = 64;

/** Below this a "sentence" is a fragment ("Hi." / "Wow!"), and cutting there
 *  throws away the part that identifies the save. */
const MIN_SENTENCE = 24;

/**
 * Prefer a whole first sentence; fall back to a whole first word-run.
 *
 * The ellipsis is only added when something was actually dropped — a title that
 * ends because the sentence ended is complete, and marking it "…" would claim a
 * truncation that never happened.
 */
export function cardTitle(raw: string | null | undefined): string {
  const line = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (!line) return '';
  if (line.length <= CAP) return line;

  // A sentence that ends inside the budget is the best title we can get: it is
  // whole, and the author chose where it stopped.
  const sentence = line.slice(0, CAP + 1).match(/^.*?[.!?…](?=\s|$)/);
  if (sentence && sentence[0].length >= MIN_SENTENCE) {
    return sentence[0].replace(/\s*\.$/, '');
  }

  // Otherwise cut on a space so no word is split. `lastIndexOf` on the +1 slice
  // means a space exactly at the cap still counts as a clean break.
  const slice = line.slice(0, CAP + 1);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > MIN_SENTENCE ? slice.slice(0, lastSpace) : line.slice(0, CAP);
  return cut.replace(/[\s,;:—–-]+$/, '') + '…';
}
