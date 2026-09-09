import { getShareExtensionKey } from 'expo-share-intent';

/**
 * ⚠️ WITHOUT THIS FILE, EVERY iOS SHARE LANDS ON "Unmatched Route".
 *
 * Owner report, 2026-09-09, first TestFlight build: sharing a YouTube video
 * opened Findable on a 404 screen showing
 * `savehere://dataUrl=savehereShareKey?nonce=B693AA52-…`.
 *
 * That URL is the share extension working correctly. `expo-share-intent` wakes
 * the app with it and stashes the real payload in the shared app group — the
 * URL is a doorbell, not an address. But expo-router treats every incoming URL
 * as a route: it scans for `./+native-intent.[tj]sx?` (see
 * expo-router/build/getLinkingConfig.js) and, finding none, tried to navigate
 * to a path named `dataUrl=savehereShareKey` and rendered its 404.
 *
 * So the fix is not in the share handler — that code was always correct, it
 * just never got the chance to run before the router had already given up.
 * `ShareIntentProvider` sits ABOVE the router in _layout.tsx and delivers the
 * payload independently, which is why sending the router to the root here is
 * enough: it lands somewhere real, and `ShareIntentHandler` does the save.
 *
 * ⚠️ Runs for EVERY deep link, including `savehere://auth/callback` — the
 * OAuth redirect for Google and Apple sign-in. Anything that is not a share
 * MUST be returned untouched, or sign-in breaks instead.
 */
export function redirectSystemPath({ path }: { path: string | null; initial: boolean }) {
  try {
    if (path?.includes(`dataUrl=${getShareExtensionKey()}`)) return '/';
    return path;
  } catch {
    // getShareExtensionKey() derives the scheme from app.json via expo-linking
    // and can throw in odd environments. A share that fails to be recognised
    // should still open the app, not crash the linking layer.
    return path;
  }
}
