import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { api, apiBaseUrl } from './api';
import { setShareConfig, clearShareConfig } from '../modules/share-config';

/**
 * The credential the Android invisible-share Activity carries.
 *
 * ⚠️ WHY NOT JUST USE THE SUPABASE SESSION. The no-display share Activity runs
 * OUTSIDE the JS runtime — no React Native context, no supabase-js. Two obvious
 * routes were both rejected:
 *
 *   Read the stored access token.  It lives ~1 h and only auto-refreshes while
 *       the app is open, so someone who opened Findable at breakfast and shares
 *       a reel at lunch has a four-hour-old token. That is the MAJORITY case.
 *   Refresh it from Kotlin.  Supabase rotates refresh tokens, so a native
 *       refresh revokes the one the app is still holding and the next launch
 *       signs the user out. A 1 s flash is not worth a random logout.
 *
 * So the app mints a long-lived, save-scoped key while it holds a valid JWT and
 * parks it here. Backend rationale and scope proof: `backend/app/sharekey.py`.
 *
 * ⚠️ THE KEY AND THE SHAPE ARE A CONTRACT WITH KOTLIN *AND* SWIFT. AsyncStorage
 * on Android is the SQLite file `RKStorage` (table `catalystLocalStorage`), NOT
 * SharedPreferences — the Activity reads this exact row. `apiUrl` rides along
 * because `EXPO_PUBLIC_API_URL` is inlined into the JS bundle at build time and
 * simply does not exist natively; storing it here also means the Activity can
 * never talk to a different backend than the app.
 *
 * ⚠️ iOS NEEDS A SECOND COPY, IN A DIFFERENT PLACE. A Share Extension is its
 * own process with its own container and CANNOT read the app's AsyncStorage.
 * The App Group is the only surface both processes see, so the same JSON is
 * also written there through the `share-config` local module. Two stores, one
 * shape — if this object ever changes, both native readers change with it
 * (mobile/plugins/android/ShareSave.kt and
 * mobile/plugins/withInvisibleShareIOS.js).
 */

const KEY = '@savehere:sharekey:v1';
/** Did the LAST arming attempt actually finish? See `shareKeyReady`. */
const STATE = '@savehere:sharekey:armed:v1';

interface ShareConfig {
  key: string;
  apiUrl: string;
}

/**
 * True when the invisible share is armed on this device.
 *
 * ⚠️ THIS EXISTS BECAUSE THE FAILURE WAS INVISIBLE. Arming ran once per launch,
 * swallowed every error, and told nobody. A share then quietly fell back to
 * opening the app — indistinguishable, from the outside, from the bug the whole
 * extension was built to fix. There was no way for the owner to answer "is the
 * key even there?" and no way for me to ask their device.
 *
 * A cold Render free instance takes ~50 s to answer (see the note in
 * contexts/AuthContext.tsx), which is precisely how a launch-time mint loses.
 */
export async function shareKeyReady(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  return (await AsyncStorage.getItem(STATE).catch(() => null)) === 'armed';
}

/** Re-arm only if the last attempt didn't finish. Cheap to call on resume. */
export async function retryShareKeyIfNeeded(): Promise<void> {
  if (await shareKeyReady()) return;
  await ensureShareKey();
}

/**
 * Ensure a share key exists for this session. Safe to call on every launch —
 * minting is idempotent from the user's point of view (the new key replaces
 * the old one) and it is what keeps the server's tier/quota snapshots fresh.
 *
 * Best-effort by design: a failure here costs the *invisible* share, not the
 * share. Without a key the Activity forwards the intent to the app, which is
 * exactly today's Phase A behaviour.
 */
export async function ensureShareKey(): Promise<boolean> {
  // Both native platforms now have an invisible share: Android's ShareActivity
  // and, since 2026-09-10, the iOS Share Extension. Web has neither.
  if (Platform.OS === 'web') return false;

  // ⚠️ RETRIED, because ONE attempt at launch is the wrong number. Minting
  // needs the backend, the backend is a free Render instance, and a cold one
  // takes ~50 s to answer — so the request most likely to fail is the one fired
  // the instant the app opens. It used to fail there silently and never try
  // again until the next cold start, leaving the share falling back to opening
  // the app for the rest of the session.
  const BACKOFF = [0, 3000, 12000];
  for (let i = 0; i < BACKOFF.length; i++) {
    if (BACKOFF[i]) await new Promise(r => setTimeout(r, BACKOFF[i]));
    try {
      const { key } = await api.createShareKey();
      const config: ShareConfig = { key, apiUrl: apiBaseUrl() };
      const json = JSON.stringify(config);
      await AsyncStorage.setItem(KEY, json);
      // iOS reads from the App Group, not from AsyncStorage.
      //
      // ⚠️ THE RETURN VALUE IS CHECKED NOW. It was discarded, so a build whose
      // native module was missing or unentitled stored a perfectly good key in
      // a place the Share Extension cannot see and reported success. "We wrote
      // it" and "the other process can read it" are different claims.
      if (Platform.OS === 'ios' && !setShareConfig(json)) {
        await AsyncStorage.setItem(STATE, 'unarmed').catch(() => {});
        return false;   // native module absent — retrying cannot fix it
      }
      await AsyncStorage.setItem(STATE, 'armed').catch(() => {});
      return true;
    } catch {
      // Offline, cold backend, or a build that predates the endpoint. Leave
      // whatever is already stored — an older key still works until superseded.
    }
  }
  await AsyncStorage.setItem(STATE, 'unarmed').catch(() => {});
  return false;
}

/**
 * Drop the key on sign-out, locally AND on the server.
 *
 * The local delete is the one that matters for correctness (the Activity must
 * not keep saving into an account nobody is signed into on this device); the
 * server revoke is because a credential that outlives the session it was
 * minted from should be killable from the other end too.
 */
export async function clearShareKey(): Promise<void> {
  await AsyncStorage.removeItem(KEY).catch(() => {});
  await AsyncStorage.removeItem(STATE).catch(() => {});
  // ⚠️ The App Group copy has to go too. Miss it and the Share Extension keeps
  // a working credential after sign-out and carries on saving into an account
  // nobody is signed into on this device — the exact failure the local delete
  // above exists to prevent, one process over.
  if (Platform.OS === 'ios') clearShareConfig();
  try {
    await api.revokeShareKey();
  } catch {
    // Signing out must never fail because a revoke did. The local copy is
    // gone, which is what stops this device sharing silently.
  }
}
