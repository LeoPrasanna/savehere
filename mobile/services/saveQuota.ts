/**
 * How close this library is to the save ceiling, and what to say about it.
 *
 * The cap is 1000 on EVERY tier (owner, 2026-09-11) — a storage ceiling, not a
 * paywall, so nothing here upsells. It used to be 20 on the post-trial free
 * tier and unlimited above it; `backend/app/config.py → SAVE_LIMIT` is the one
 * source of truth and the client is told the number rather than knowing it.
 *
 * ⚠️ THRESHOLDS ARE RATIOS, NOT THE LITERAL 900 AND 950. The owner asked for a
 * warning at 900 and a stronger one at 950, which is 90% and 95% of 1000 —
 * written as fractions so changing SAVE_LIMIT on the server moves both warnings
 * with it instead of stranding them. Hardcoding 900 against a limit of 200
 * would mean the user is refused a save having never been warned at all.
 */

export const WARN_AT = 0.9;
export const CRITICAL_AT = 0.95;

export type QuotaLevel = 'ok' | 'warn' | 'critical' | 'full';

export interface SaveQuota {
  level: QuotaLevel;
  used: number;
  limit: number;
  remaining: number;
  /** One line, already written. Empty at 'ok'. */
  message: string;
}

const OK: SaveQuota = { level: 'ok', used: 0, limit: 0, remaining: 0, message: '' };

/**
 * @param used  saves currently in the library
 * @param limit the server's cap; `null` means the server said unlimited, which
 *              no tier does today but the API type still allows
 */
export function saveQuota(used: number | null | undefined, limit: number | null | undefined): SaveQuota {
  if (typeof used !== 'number' || typeof limit !== 'number' || limit <= 0) return OK;

  const remaining = Math.max(0, limit - used);
  const ratio = used / limit;
  const base = { used, limit, remaining };

  if (used >= limit) {
    return {
      ...base, level: 'full',
      message: `Library full — ${used}/${limit} saves. Delete a few to keep saving.`,
    };
  }
  if (ratio >= CRITICAL_AT) {
    return {
      ...base, level: 'critical',
      // Says what happens next, not just where they are. A number alone is a
      // fact; "room for 37 more" is the thing worth acting on.
      message: `${used}/${limit} saves — room for ${remaining} more.`,
    };
  }
  if (ratio >= WARN_AT) {
    return {
      ...base, level: 'warn',
      message: `${used}/${limit} saves — delete a few if you'd rather not run out.`,
    };
  }
  return { ...base, level: 'ok', message: '' };
}
