/**
 * Pro pricing — one source of truth for the paywall.
 *
 * ⚠️ NOTHING HERE IS WIRED TO A PAYMENT PROVIDER. The paywall renders these
 * numbers and simulates a purchase. Real billing needs StoreKit/Play Billing
 * via RevenueCat, and the server-side half is already specced: the IAP webhook
 * writes `app_metadata.tier = "pro"`, which `app/quota.py::daily_limit_for`
 * already reads. See TODO.md → "Per-user AI quota".
 *
 * ⚠️ THE INR PAIR IS UPSIDE DOWN. ₹20/week is ₹86.96/month at 4.348 weeks —
 * cheaper than the ₹99 monthly. The monthly plan is the WORSE deal in INR while
 * being 19% better in USD. `savingPct` below computes the real number from the
 * real prices and returns null when there is no saving, so the UI physically
 * cannot show a "SAVE X%" badge that isn't true. Fix the prices, not the badge:
 * ₹99/mo needs weekly at ~₹30 to read as a discount.
 *
 * ⚠️ Owner decision still open (TODO.md): the 2026-07-24 cost study put
 * break-even at ~4.2% conversion and recommended ₹149/mo, calling ₹99
 * "underwater — it barely covers a pro user's own AI cost". If ₹99 ships, the
 * Pro daily AI cap (`AI_PRO_DAILY_LIMIT`, currently 100) has to come down with
 * it or every Pro user is a loss.
 */

/** Average weeks in a month (365.25 / 12 / 7). Used to compare cadences. */
const WEEKS_PER_MONTH = 4.348;

export interface Plan {
  id: 'weekly' | 'monthly';
  /** Shown big. */
  price: number;
  /** Struck through when present — the pre-discount list price. */
  wasPrice?: number;
  period: string;
  cadence: 'week' | 'month';
  note: string;
}

export interface Pricing {
  code: 'INR' | 'USD';
  symbol: string;
  plans: Plan[];
}

const INR: Pricing = {
  code: 'INR',
  symbol: '₹',
  plans: [
    { id: 'weekly',  price: 20, period: 'per week',  cadence: 'week',  note: 'Try it for a week' },
    { id: 'monthly', price: 99, wasPrice: 120, period: 'per month', cadence: 'month', note: 'Launch price' },
  ],
};

const USD: Pricing = {
  code: 'USD',
  symbol: '$',
  plans: [
    { id: 'weekly',  price: 2, period: 'per week',  cadence: 'week',  note: 'Try it for a week' },
    { id: 'monthly', price: 7, period: 'per month', cadence: 'month', note: 'Best value' },
  ],
};

/**
 * India gets INR, everyone else USD.
 *
 * `Intl` is present in Hermes and in every browser, so one call covers native
 * and web. Wrapped because a locale string without a region ("en") is legal and
 * `maximize()` is not universally implemented.
 */
export function pricingForDevice(): Pricing {
  try {
    const loc = Intl.DateTimeFormat().resolvedOptions().locale || '';
    if (/[-_]IN\b/i.test(loc)) return INR;
  } catch {}
  return USD;
}

/**
 * What the monthly plan actually saves against paying weekly, as a whole
 * percent. Returns null when it saves nothing — which is the entire point:
 * a caller cannot render a discount badge that the prices don't support.
 */
export function savingPct(p: Pricing): number | null {
  const weekly = p.plans.find(x => x.id === 'weekly');
  const monthly = p.plans.find(x => x.id === 'monthly');
  if (!weekly || !monthly) return null;
  const weeklyPerMonth = weekly.price * WEEKS_PER_MONTH;
  const pct = Math.round((1 - monthly.price / weeklyPerMonth) * 100);
  return pct > 0 ? pct : null;
}

/** Format a price for display. Whole numbers stay whole — "₹99", not "₹99.00". */
export const money = (p: Pricing, n: number) =>
  `${p.symbol}${Number.isInteger(n) ? n : n.toFixed(2)}`;

/**
 * What Pro actually unlocks. Grounded in real product behaviour, not marketing:
 * every line below maps to a gate that exists in the codebase today.
 */
export const PRO_BENEFITS: { title: string; detail: string }[] = [
  {
    title: 'Summaries on every save',
    detail: 'Free saves queue behind a small daily allowance and fall back to a manual retry. Pro summarises the moment you save, every time.',
  },
  {
    title: 'A much larger daily AI budget',
    detail: 'Summaries, recipes, workouts and questions all draw from one daily pool. Pro raises the ceiling so a heavy day does not run you dry.',
  },
  {
    title: 'Ask your library, unrationed',
    detail: 'Ask a question in plain words and get an answer built only from your own saves, with the sources it used.',
  },
  {
    title: 'Recipes, workouts and action steps',
    detail: 'Turn a cooking reel into numbered steps, a gym reel into a plan with sets and rest timers, a tutorial into a checklist you can tick off.',
  },
  {
    title: 'Rediscover',
    detail: 'Resurfaces saves you forgot about, so the pile stops rotting quietly.',
  },
];
