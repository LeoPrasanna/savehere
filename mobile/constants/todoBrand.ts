/**
 * The to-do feature's product name and copy, in ONE place.
 *
 * Renaming is a single edit here — the screen title, the home-screen row, the
 * reel-detail button and the empty states all read from these constants. Do not
 * hardcode the name anywhere else.
 *
 * Why "Follow Through": it names the thing the user actually fails at. A
 * bookmarking app's whole failure mode is saving something and never acting on
 * it, and this list exists to close exactly that gap — so the name states the
 * promise rather than describing the widget ("To-do list" could be any app).
 *
 * Alternatives considered, if this one doesn't land: "Momentum", "Next Up",
 * "The Shortlist", "Loose Ends".
 */
export const TODO_BRAND = 'Follow Through';

/** Used where the name alone is ambiguous ("Follow Through" as a nav title is
 *  clear; on a button it needs the verb). */
export const TODO_ADD_LABEL = `Add to ${TODO_BRAND}`;
export const TODO_ADDED_LABEL = `On your ${TODO_BRAND} list`;

/**
 * Vertically rolled through the dashboard header. Short, famous, attributed —
 * these are widely circulated aphorisms, quoted in full and credited (the
 * attributions are the commonly cited ones).
 *
 * Keep each to a single line so it fits the roller's viewport without wrapping
 * to a third line.
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
