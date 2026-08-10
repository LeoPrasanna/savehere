/**
 * Pro pricing — one source of truth for the paywall.
 *
 * ⚠️ NOTHING HERE IS WIRED TO A PAYMENT PROVIDER. The paywall renders these
 * numbers and simulates a purchase. Real billing needs StoreKit/Play Billing
 * via RevenueCat, and the server-side half is already specced: the IAP webhook
 * writes `app_metadata.tier = "pro"`, which `app/quota.py::daily_limit_for`
 * already reads. See TODO.md → "Per-user AI quota".
 *
 * PRICES SET BY THE OWNER 2026-08-10, paired with a Pro cap of 20 AI actions/day
 * (`AI_PRO_DAILY_LIMIT`): ₹25/week · ₹99/month · $1.99/week · $7/month.
 *
 * ₹99/month is an **Apple Introductory Offer**: ₹99 for the first 6 months, then
 * ₹120 (owner, 2026-08-10). The offer itself is App Store Connect + RevenueCat
 * configuration — the only app-side obligation is DISCLOSING it, which
 * `renewalTerms()` below now does. Apple grants an intro offer once per customer
 * per subscription group, so a returning subscriber pays the standard price.
 *
 * ⚠️ TWO INTRO PRICES ARE STILL UNSET and deliberately left off rather than
 * guessed: the USD monthly revert price, and whether the weekly plans carry an
 * intro at all. A plan without `introMonths` renders the plain renewal sentence,
 * which is TRUE for a plan with no offer — so the gap is safe, just incomplete.
 * ₹99→₹120 is a 17.5% intro discount; the USD analogue would be ~$8.49.
 *
 * ✅ The INR pair is no longer upside down. It used to be: ₹20/week is ₹86.96 a
 * month at 4.348 weeks, so the ₹99 monthly was the WORSE deal and `savingPct`
 * correctly refused to render a badge. At ₹25/week the monthly saves ~9% (USD
 * saves ~19%), so both storefronts can now show a truthful badge. Keep it that
 * way: `savingPct` computes from the real prices and returns null when there is
 * no saving, so the UI physically cannot show a "SAVE X%" that isn't true.
 *
 * ⚠️ ₹99 DOES NOT COVER A MAXED-OUT INR PRO USER, knowingly. At ~$0.004 per AI
 * action, 20/day is ~$2.43/month worst case. $7 nets $5.95 after Apple's 15% and
 * clears it ~2.4x; ₹99 nets ~₹84 (~$0.96) and does not — an INR Pro user who hits
 * the cap every day costs ~2.5x their subscription. This is a deliberate
 * cross-subsidy (owner, 2026-08-10): run India generous on volume, cover it from
 * US margin, revisit after 6 months — i.e. when the intro offer above expires.
 * ₹99 breaks even at ~8/day. Note the direction: raising the cap WIDENS this gap.
 * If it ever needs closing the seam is a storefront-specific tier, not a price
 * change here.
 */

/** Average weeks in a month (365.25 / 12 / 7). Used to compare cadences. */
const WEEKS_PER_MONTH = 4.348;

export interface Plan {
  id: 'weekly' | 'monthly';
  /** Shown big. Under an Introductory Offer this is the INTRO price. */
  price: number;
  /**
   * Struck through when present — the standard list price. When `introMonths`
   * is set this is also the price the subscription REVERTS to.
   */
  wasPrice?: number;
  /**
   * Apple Introductory Offer length in months. Set = `price` applies for this
   * many months and then renewal moves to `wasPrice`. Requires `wasPrice`.
   */
  introMonths?: number;
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
    { id: 'weekly',  price: 25, period: 'per week',  cadence: 'week',  note: 'Try it for a week' },
    { id: 'monthly', price: 99, wasPrice: 120, introMonths: 6, period: 'per month', cadence: 'month', note: 'First 6 months' },
  ],
};

const USD: Pricing = {
  code: 'USD',
  symbol: '$',
  plans: [
    { id: 'weekly',  price: 1.99, period: 'per week',  cadence: 'week',  note: 'Try it for a week' },
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
 * The renewal sentence, in one place because it must never be wrong.
 *
 * ⚠️ Under an Apple Introductory Offer the intro price is NOT what the user goes
 * on paying, and "auto-renews monthly at ₹99 until cancelled" would be a false
 * statement — App Store review requires the intro price, its duration AND the
 * standard price to be disclosed together on the purchase screen. This was a
 * real bug: that exact sentence was hardcoded at TWO sites in `app/pro.tsx`
 * before the offer existed. Both now call this.
 */
export function renewalTerms(p: Pricing, plan: Plan): string {
  const cadence = plan.cadence === 'week' ? 'weekly' : 'monthly';
  if (plan.introMonths && plan.wasPrice != null) {
    return `Auto-renews ${cadence} at ${money(p, plan.price)} for the first ${plan.introMonths} months, then ${money(p, plan.wasPrice)} until cancelled.`;
  }
  return `Auto-renews ${cadence} at ${money(p, plan.price)} until cancelled.`;
}

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
