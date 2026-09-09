import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from './supabase';

/**
 * Social sign-in through Supabase, using the PKCE authorization-code flow.
 *
 * WHY A BROWSER AND NOT A NATIVE SDK
 * `@react-native-google-signin/google-signin` would give a native account
 * picker, but it is a second native dependency, needs its own per-build
 * client IDs, and does nothing for Apple on Android. Supabase's OAuth endpoint
 * plus the system browser covers EVERY provider with one code path, and
 * `openAuthSessionAsync` uses Custom Tabs / ASWebAuthenticationSession — the
 * OS's own in-app browser, which shares the system cookie jar. So a user
 * already signed into Google on the phone gets one tap, not a password prompt.
 *
 * ⚠️ THIS IS NATIVE-ONLY BY DESIGN. On web, Supabase does the whole redirect
 * dance itself and `detectSessionInUrl` (services/supabase.ts) picks the
 * session up on the way back, so `signInWithProvider` hands off to the plain
 * redirect there and never opens a second browser inside a browser.
 *
 * ⚠️ REQUIRES A REAL BUILD. `expo-web-browser` is a native module, and the
 * redirect lands on the `savehere://` scheme registered in app.json — neither
 * exists in a web preview.
 *
 * OWNER SETUP, per provider, before any of this returns a session:
 *   Google — Google Cloud console → OAuth client (Web application type, NOT
 *     Android: the callback is Supabase's URL, not the app's). Authorized
 *     redirect URI must be
 *       https://<project-ref>.supabase.co/auth/v1/callback
 *     Paste the client ID + secret into Supabase → Authentication → Providers
 *     → Google, and enable it.
 *   Apple — needs the $99 Apple Developer account (still unpurchased, see
 *     TODO.md), then a Services ID + signing key. Not wired: `notYet()` in
 *     LoginScreen still guards that button.
 *
 * Then add the app's own redirect to Supabase → Authentication → URL
 * Configuration → Redirect URLs:  savehere://auth/callback
 */

export type OAuthProvider = 'google' | 'apple';

/**
 * `savehere://auth/callback` in a build, `http://localhost:8081/...` in dev.
 * Built from the scheme in app.json rather than hardcoded, so a scheme change
 * cannot silently break sign-in.
 */
export function redirectUri(): string {
  return Linking.createURL('auth/callback');
}

function messageFor(err: unknown): string {
  const raw = (err as { message?: string })?.message || '';
  if (/provider is not enabled/i.test(raw)) {
    return 'That sign-in method is not switched on for this app yet.';
  }
  if (/network|fetch/i.test(raw)) return "Couldn't reach the sign-in service. Check your connection.";
  return raw || 'Sign-in failed. Try again.';
}

/**
 * Runs the provider's sign-in and resolves once the Supabase session exists.
 *
 * Returns `{ error }` rather than throwing — LoginScreen renders errors inline
 * and a rejected promise there would just become an unhandled rejection.
 * A user who backs out of the browser gets `{ cancelled: true }` and NO error
 * message: dismissing a sheet on purpose is not a failure to report.
 */
export async function signInWithProvider(
  provider: OAuthProvider,
): Promise<{ error: string | null; cancelled?: boolean }> {
  try {
    const redirectTo = redirectUri();

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        // Native: we open the URL ourselves. Without this, supabase-js tries to
        // navigate `window.location`, which does not exist on RN — the call
        // resolves having done nothing at all.
        skipBrowserRedirect: Platform.OS !== 'web',
      },
    });
    if (error) return { error: messageFor(error) };

    // Web: supabase-js has already navigated; detectSessionInUrl finishes it.
    if (Platform.OS === 'web') return { error: null };

    if (!data?.url) return { error: 'Sign-in could not be started. Try again.' };

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') return { error: null, cancelled: true };

    // The PKCE code comes back on the redirect URL. Exchange it for the real
    // session — until this runs the user is NOT signed in, and skipping it is
    // the classic "the browser closed but nothing happened" bug.
    //
    // The code may arrive in the query (?code=) or, for implicit-style
    // responses, in the fragment (#access_token=). Handle the query form and
    // fall back to letting supabase-js parse the whole URL.
    const code = new URL(result.url).searchParams.get('code');
    if (code) {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) return { error: messageFor(exchangeError) };
      return { error: null };
    }

    const params = new URLSearchParams(result.url.split('#')[1] ?? '');
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (access_token && refresh_token) {
      const { error: setError } = await supabase.auth.setSession({ access_token, refresh_token });
      if (setError) return { error: messageFor(setError) };
      return { error: null };
    }

    // Some providers surface a denial as a redirect carrying error params
    // rather than a dismissed browser.
    const denied = new URL(result.url).searchParams.get('error_description');
    if (denied) return { error: denied };

    return { error: 'Sign-in did not complete. Try again.' };
  } catch (e) {
    return { error: messageFor(e) };
  }
}

/**
 * Sign in with Apple — the NATIVE flow, deliberately not `signInWithProvider`.
 *
 * Apple hands iOS an identity token directly and Supabase verifies it
 * (`signInWithIdToken`). No browser, no PKCE round trip, and — the part that
 * matters operationally — NO Services ID and NO `.p8` signing key. The web
 * OAuth flow would need both, and its client secret is a JWT that Apple caps
 * at SIX MONTHS: every login in the app would break twice a year unless
 * somebody remembered to rotate it. This path has nothing to expire.
 *
 * Apple's side is therefore just: the App ID's "Sign In with Apple" capability
 * (EAS syncs it from the entitlement this package adds), and the BUNDLE ID
 * listed under Client IDs in Supabase → Auth → Providers → Apple. Same bundle
 * ID in both the dev and prod projects; nothing here is per-environment.
 *
 * iOS-only. Android keeps Google — offering Apple there would drag the whole
 * Services ID + key + rotation apparatus back in for users who don't need it.
 */
export async function signInWithApple(): Promise<{ error: string | null; cancelled?: boolean }> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      return { error: 'Apple did not return a sign-in token. Try again.' };
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });
    if (error) return { error: messageFor(error) };

    // ⚠️ APPLE SENDS THE NAME EXACTLY ONCE — on the first authorisation, and
    // never again on any later sign-in. It is NOT in the identity token, so
    // Supabase cannot recover it. Miss this and the account is permanently
    // nameless (displayName falls back to the email prefix, and Apple's relay
    // addresses look like `a1b2c3@privaterelay.appleid.com`).
    const given = credential.fullName?.givenName?.trim();
    if (given) {
      // Best-effort: a failure here costs a display name, not the session the
      // user just successfully created.
      await supabase.auth.updateUser({ data: { first_name: given } }).catch(() => {});
    }

    return { error: null };
  } catch (e) {
    // Tapping "Cancel" on the Apple sheet is a decision, not a failure.
    if ((e as { code?: string })?.code === 'ERR_REQUEST_CANCELED') {
      return { error: null, cancelled: true };
    }
    return { error: messageFor(e) };
  }
}
