/**
 * How big the tab bar should be on THIS screen.
 *
 * ⚠️ THE BAR USED TO BE A FIXED SIZE AT EVERY WIDTH. Five 42pt slots hugging
 * their own content is a sensible pill on a 375pt iPhone SE and a stranded
 * little island on a 430pt Pro Max — the owner's report, 2026-09-11, against
 * Apple Music's tab bar, which spans nearly the full width on the same phone.
 *
 * So the bar stretches now, and the slot grows with it. The formula is one
 * line: divide the width the bar actually gets between the tabs, then clamp so
 * a small phone does not get cramped targets and a tablet does not get
 * cartoonish ones. No device breakpoints, no model list — those go stale the
 * week a new size ships.
 *
 * ⚠️ `maxWidth` IS DERIVED FROM THE SLOT, NOT A CONSTANT — and the first
 * version got this wrong in a way no phone could show. It returned a flat 560
 * and the row carried `alignSelf: 'stretch'`, so on an iPad the row stretched,
 * hit 560, and a stretched item that meets its max-width is laid out at the
 * START of the cross axis. The bar sat flush LEFT on a 1024pt screen
 * (owner, 2026-09-11) while looking perfectly centred on every phone, because
 * a phone's available width is under 560 and the stretch simply filled it.
 * Two bugs in one: the alignment, and a 560pt bar holding 390pt of content.
 *
 * Now the bar asks for exactly the width its slots need once they cap out, and
 * `alignSelf: 'center'` does the centring. Below the cap that number equals the
 * space available, so the bar still fills a phone edge to edge. One formula,
 * centred everywhere, no special case for tablets.
 */

/** Chrome the pill spends on itself: 6+6 padding, 1+1 border, 2pt inter-tab gaps. */
const PILL_CHROME = 6 + 6 + 1 + 1 + 2 * 4;
/** The detached Ask capsule is `slot + 6+6 padding + 1+1 border` wide. */
const ASK_CHROME = 6 + 6 + 1 + 1;

export const MIN_SLOT = 42;
export const MAX_SLOT = 58;

export interface TabBarSize {
  /** Square side of one tab's touch target / active ring. */
  slot: number;
  /** Icon point size — kept proportional so a bigger slot isn't a bigger gap. */
  icon: number;
  /**
   * What the row should cap at — slot-derived, so a wide screen gets a bar the
   * size of its contents rather than a 560pt one holding 390pt of icons.
   * Pair it with `alignSelf: 'center'`, never `'stretch'`: see the note above.
   */
  maxWidth: number;
}

/**
 * @param width  full screen width
 * @param gutter horizontal padding either side of the bar, plus the gap between
 *               the pill and the detached Ask capsule
 */
export function tabBarSize(width: number, gutter: number): TabBarSize {
  const usable = width - gutter - PILL_CHROME - ASK_CHROME;
  // Six slots share it: five tabs in the pill, plus the detached Ask.
  const raw = Math.floor(usable / 6);
  const slot = Math.max(MIN_SLOT, Math.min(MAX_SLOT, raw));
  return {
    slot,
    // 0.45 keeps the glyph the same visual weight it had at 42/19.
    icon: Math.round(slot * 0.45),
    // The width six of THESE slots actually need. On a phone this lands at (or
    // just under) the space available and the bar fills it; on a tablet the
    // slot has capped, so this is smaller than the screen and the bar centres.
    maxWidth: slot * 6 + PILL_CHROME + ASK_CHROME,
  };
}
