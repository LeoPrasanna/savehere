import { Redirect } from 'expo-router';

/**
 * OAuth landing route — exists purely so the deep link has somewhere to land.
 *
 * ⚠️ WHY THIS FILE IS NECESSARY, given nothing here does any auth work.
 *
 * `savehere://auth/callback` gets handled TWICE, by two different systems:
 *
 *  1. `expo-web-browser` is watching for it (`openAuthSessionAsync(url,
 *     redirectTo)` in services/oauth.ts). It closes the Custom Tab and hands
 *     the URL back to JS, which exchanges the `?code=` for a session. This is
 *     the part that actually signs you in, and it worked without this file.
 *
 *  2. Android ALSO delivers the same URL to the app as an ordinary deep link,
 *     and expo-router routes it by path. With no `app/auth/callback` route it
 *     matched nothing, so the router rendered its "Unmatched route" screen —
 *     on top of an app that had just successfully signed the user in. Tapping
 *     "Go back" popped that screen and revealed a working, logged-in app,
 *     which is exactly what the owner reported (2026-08-12).
 *
 * So this is a ROUTING fix, not an auth fix. A `<Redirect>` rather than a
 * screen with an effect: there is nothing to wait for — the session either
 * landed (→ the library) or it didn't (→ the auth gate shows LoginScreen).
 * Either way `/` is the correct destination and there is no spinner frame.
 *
 * ⚠️ Do NOT put the code exchange in here as well. Both paths would then race
 * to redeem a single-use PKCE code, and the loser gets an
 * "invalid request: code verifier should be non-empty" style failure on a
 * sign-in that had already succeeded.
 */
export default function AuthCallback() {
  return <Redirect href="/" />;
}
