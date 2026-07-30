/**
 * Calendar-date helpers for the to-do list.
 *
 * Every date here is a plain "YYYY-MM-DD" in the DEVICE's timezone. The server
 * stores exactly that string and never converts it, so all bucketing lives on
 * the client — "today" is a local concept and the backend runs on UTC.
 *
 * ⚠️ Never use `new Date("2026-08-01")` on these: the ISO-date form is parsed as
 * UTC midnight, which renders as the PREVIOUS day everywhere west of Greenwich.
 * `parseLocal` builds the date from parts instead, which is always local.
 */

export type Bucket = 'overdue' | 'today' | 'upcoming' | 'someday';

/** "YYYY-MM-DD" -> local Date at midnight. Returns null for junk. */
export function parseLocal(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(y, mo - 1, d);
  // Rejects overflow like 2026-02-31, which the Date constructor would roll over.
  return dt.getMonth() === mo - 1 && dt.getDate() === d ? dt : null;
}

/** Local Date -> "YYYY-MM-DD" (never `toISOString()`, which shifts to UTC). */
export function toISODate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

/** Today + n days, as a local calendar date string. */
export function daysFromToday(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** The coming Saturday (today counts if it already is Saturday). */
export function nextWeekend(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
  return toISODate(d);
}

/** Whole days from today — negative means overdue. */
export function daysUntil(iso: string): number | null {
  const target = parseLocal(iso);
  if (!target) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function bucketOf(due: string | null): Bucket {
  if (!due) return 'someday';
  const n = daysUntil(due);
  if (n === null) return 'someday';
  if (n < 0) return 'overdue';
  if (n === 0) return 'today';
  return 'upcoming';
}

/** Short human label for a due date: "Today", "Tomorrow", "3 days late", "Mon 4 Aug". */
export function formatDue(due: string | null): string {
  if (!due) return 'Someday';
  const n = daysUntil(due);
  const d = parseLocal(due);
  if (n === null || !d) return 'Someday';
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return '1 day late';
  if (n < 0) return `${-n} days late`;
  if (n < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}
