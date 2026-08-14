/**
 * "When does my AI budget come back?" — one formatter, every surface.
 *
 * The server already answers this: `GET /api/account/usage` returns `resets_at`,
 * midnight UTC of the next quota day (backend/app/routes/account.py). Nothing
 * new is fetched here — the number was always in hand, it was just never shown,
 * so every out-of-AI message in the app said the vague "tomorrow" instead of a
 * time the user could plan around. Midnight UTC is 5:30 AM in India and 8 PM
 * the *previous* day in California: "tomorrow" is actively wrong for some users.
 *
 * ⚠️ Formatted BY HAND rather than with `toLocaleTimeString`. Intl options are
 * honoured inconsistently across Hermes builds, and a meter that renders
 * "5:30:00 AM GMT+5:30" on one device and "05:30" on another is worse than one
 * that looks the same everywhere. Local hours/minutes come off the Date itself,
 * which is reliable on every engine.
 *
 * Pure on purpose: no imports, so `quotaReset.test.ts` runs under plain node.
 */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Local midnight, as epoch ms — so "which day is this" is a calendar question,
 *  not a 24-hour-difference question (23:00 and 01:00 are a day apart). */
function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function clockTime(d: Date): string {
  const h = d.getHours();
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/**
 * "5:30 AM tomorrow" / "8:00 PM today" / "5:30 AM on Tuesday".
 *
 * Returns '' for a missing or unparseable value — every call site renders the
 * label inline, and a blank is the honest fallback for "we don't know when".
 * Never guess a reset time: a wrong one is a promise the app then breaks.
 *
 * `now` is injectable for the tests only.
 */
export function resetsAtLabel(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';

  const days = Math.round((startOfLocalDay(at) - startOfLocalDay(now)) / 86400000);
  const time = clockTime(at);
  // days <= 0 covers "already passed" too: usage is cached in memory and can be
  // a few minutes stale, so a reset that has just happened must not render as
  // "yesterday". The refreshed usage will drop the message entirely.
  if (days <= 0) return `${time} today`;
  if (days === 1) return `${time} tomorrow`;
  return `${time} on ${WEEKDAYS[at.getDay()]}`;
}

/** The full sentence the out-of-AI surfaces share, so the wording can't drift
 *  between the panel, the save screen and the reel card. */
export function resumesAtSentence(iso: string | null | undefined): string {
  const label = resetsAtLabel(iso);
  return label ? `AI actions come back at ${label}.` : 'AI actions come back after the daily reset.';
}
