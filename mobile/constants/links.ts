// Outbound support / legal links. One place, because App Store Connect asks for
// the same Support, Privacy and Terms URLs in app metadata — they must match
// what the app shows, and both must be live before submission.
//
// The pages are in this repo under `site/` and publish to GitHub Pages via
// .github/workflows/pages.yml. Swap the base below for a custom domain later;
// nothing else changes.
//
// Apple's own pages cover ONLY billing (cancel a subscription, request a refund)
// — those two are genuinely Apple's job. Everything about SaveHere itself has to
// come from us; pointing App Review at apple.com/support is a Guideline 1.5
// rejection.

const SITE = 'https://leoprasanna.github.io/savehere';

export const SUPPORT_EMAIL = 'savehere.support@gmail.com';
export const SUPPORT_URL = `${SITE}/`;
export const PRIVACY_URL = `${SITE}/privacy.html`;
export const TERMS_URL = `${SITE}/terms.html`;

/** Apple-hosted. Deep-links to the user's own subscription list. */
export const APPLE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';
/** Apple-hosted. Refunds for IAP go through Apple — we cannot issue them. */
export const APPLE_REFUNDS_URL = 'https://reportaproblem.apple.com';
