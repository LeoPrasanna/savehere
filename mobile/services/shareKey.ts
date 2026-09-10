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

interface ShareConfig {
  key: string;
  apiUrl: string;
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
export async function ensureShareKey(): Promise<void> {
  // Both native platforms now have an invisible share: Android's ShareActivity
  // and, since 2026-09-10, the iOS Share Extension. Web has neither.
  if (Platform.OS === 'web') return;
  try {
    const { key } = await api.createShareKey();
    const config: ShareConfig = { key, apiUrl: apiBaseUrl() };
    const json = JSON.stringify(config);
    await AsyncStorage.setItem(KEY, json);
    // iOS reads from the App Group, not from AsyncStorage. A false return means
    // the native module is missing (an older build) — the extension then finds
    // no key and falls back to opening the app, which is the old behaviour, not
    // a broken one.
    if (Platform.OS === 'ios') setShareConfig(json);
  } catch {
    // Offline, or a backend that predates the endpoint. Leave whatever is
    // already stored — an older key still works until it is superseded.
  }
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
