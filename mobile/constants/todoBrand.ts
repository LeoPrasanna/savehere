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
 * Keep each to one line so it fits the roller without wrapping to a third.
 */
export const TODO_QUOTES = [
  '"The secret of getting ahead is getting started." — Mark Twain',
  '"Well done is better than well said." — Benjamin Franklin',
  '"It always seems impossible until it\'s done." — Nelson Mandela',
  '"A goal without a plan is just a wish." — Antoine de Saint-Exupéry',
  '"The way to get started is to quit talking and begin doing." — Walt Disney',
  '"Start where you are. Use what you have. Do what you can." — Arthur Ashe',
  '"Lost time is never found again." — Benjamin Franklin',
  '"Action is the foundational key to all success." — Pablo Picasso',
  '"Do the hard jobs first. The easy jobs will take care of themselves." — Dale Carnegie',
  '"You may delay, but time will not." — Benjamin Franklin',
];
