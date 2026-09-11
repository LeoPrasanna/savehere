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
 */

/** Chrome the pill spends on itself: 6+6 padding, 1+1 border, 2pt inter-tab gaps. */
const PILL_CHROME = 6 + 6 + 1 + 1 + 2 * 4;
/** The detached Ask capsule is `slot + 6+6 padding + 1+1 border` wide. */
const ASK_CHROME = 6 + 6 + 1 + 1;

export const MIN_SLOT = 42;
export const MAX_SLOT = 58;
/** Tablets: past this the bar stops growing and simply centres. */
export const MAX_BAR = 560;

export interface TabBarSize {
  /** Square side of one tab's touch target / active ring. */
  slot: number;
  /** Icon point size — kept proportional so a bigger slot isn't a bigger gap. */
  icon: number;
  /** Width cap for the whole row, so this centres rather than stretches on iPad. */
  maxWidth: number;
}

/**
 * @param width  full screen width
 * @param gutter horizontal padding either side of the bar, plus the gap between
 *               the pill and the detached Ask capsule
 */
export function tabBarSize(width: number, gutter: number): TabBarSize {
  const usable = Math.min(width, MAX_BAR) - gutter - PILL_CHROME - ASK_CHROME;
  // Six slots share it: five tabs in the pill, plus the detached Ask.
  const raw = Math.floor(usable / 6);
  const slot = Math.max(MIN_SLOT, Math.min(MAX_SLOT, raw));
  return {
    slot,
    // 0.45 keeps the glyph the same visual weight it had at 42/19.
    icon: Math.round(slot * 0.45),
    maxWidth: MAX_BAR,
  };
}
