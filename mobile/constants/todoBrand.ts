/**
 * Names and copy for the to-do feature, in ONE place. Nothing else hardcodes
 * them — renaming anything here changes every surface at once.
 */

/** The home screen calls it one steady thing. A name that rolled on the home
 *  screen too would just read as noise next to the user's actual saves. */
export const TODO_LANDING_TITLE = 'Things on your slate';

/** Reel-detail button copy, kept in the same "slate" language as the home row. */
export const TODO_ADD_LABEL = 'Add to your slate';
export const TODO_ADDED_LABEL = 'On your slate';

/**
 * The list screen's hero cycles through these — "My Docket 📜", "My Almanac 🌙".
 * It's the one place the feature gets to be playful, because it's a screen the
 * user opens on purpose rather than lands on.
 *
 * Keep every entry readable directly after "My", and keep it short enough not
 * to wrap on a narrow phone.
 */
export interface TodoRollName {
  name: string;
  emoji: string;
}

export const TODO_ROLL_NAMES: readonly TodoRollName[] = [
  { name: 'Order of the Day', emoji: '🗓️' },
  { name: 'Checklist', emoji: '✅' },
  { name: 'Docket', emoji: '📜' },
  { name: 'Catalogue', emoji: '📚' },
  { name: 'List of Items', emoji: '🧾' },
  { name: 'Schedule of Operation', emoji: '⚙️' },
  { name: 'Order of Events', emoji: '🎞️' },
  { name: 'Synopsis', emoji: '📝' },
  { name: 'Playbill', emoji: '🎭' },
  { name: 'Listicle', emoji: '🔟' },
  { name: 'Almanac', emoji: '🌙' },
  { name: 'Program of Entertainment', emoji: '🎪' },
  { name: 'Worksheet', emoji: '📄' },
  { name: 'Things as They Happened', emoji: '⏳' },
  { name: 'Own Lexicon', emoji: '📖' },
  { name: 'To-do List', emoji: '📃' },
  { name: 'Digest', emoji: '🍵' },
  { name: 'Planner', emoji: '📆' },
  { name: 'Log Book', emoji: '📔' },
  { name: 'Roadmap', emoji: '🗺️' },
  { name: 'Prospectus', emoji: '📈' },
];

/**
 * Rolled through the dashboard header. Short, famous, attributed — widely
 * circulated aphorisms, quoted in full and credited (attributions are the
 * commonly cited ones).
 *
 * ⚠️ HARD BUDGET: ~58 CHARACTERS, ATTRIBUTION INCLUDED.
 *
 * The old rule here said "keep each to one line" without saying what a line
 * was, so entries drifted to 85 characters and got clipped by the roller — the
 * Carnegie one ("Do the hard jobs first…", 85 chars) was the worst. The real
 * constraint is measurable: the compact roller is a 42px viewport with
 * `overflow: hidden` at lineHeight 18, so exactly TWO lines fit, and the
 * animation translates ±22px through that window — meaning anything that needs
 * a third line is sliced mid-glyph rather than merely truncated.
 *
 * At font.sm (12px, italic) in the dashboard card that works out to ~58
 * characters. Surname-only attributions are how the longer quotes earn their
 * place. Do not "fix" an over-long entry by paraphrasing it: a trimmed quote
 * with the original name still attached is a misquote. Pick a shorter one.
 *
 * The roller also clamps to `numberOfLines={2}` at the call site (app/todos.tsx)
 * so a future over-long line degrades to an ellipsis instead of a sliced word.
 */
export const TODO_QUOTES = [
  '"Well done is better than well said." — Franklin',
  '"Lost time is never found again." — Franklin',
  '"You may delay, but time will not." — Franklin',
  '"It always seems impossible until it\'s done." — Mandela',
  '"A goal without a plan is just a wish." — Saint-Exupéry',
  '"The secret of getting ahead is getting started." — Twain',
  '"Action is the foundational key to all success." — Picasso',
  '"The best way out is always through." — Frost',
  '"Well begun is half done." — Aristotle',
  '"Start where you are." — Arthur Ashe',
];
