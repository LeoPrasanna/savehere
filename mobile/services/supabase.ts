// Supabase client (auth only — data still goes through our FastAPI backend).
// react-native-url-polyfill/auto patches the URL global RN lacks, which the
// supabase-js client needs. Must be imported before createClient.
import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Fail loud in dev if the env vars are missing — a silent undefined here turns
// into a confusing "Failed to fetch" only when the user tries to log in.
if (!url || !anonKey) {
  console.warn(
    '[supabase] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are not set. ' +
    'Add them to mobile/.env — auth will not work until then.'
  );
}

export const supabase = createClient(url ?? '', anonKey ?? '', {
  auth: {
    // AsyncStorage is the storage Supabase's Expo guide uses; sessions can exceed
    // SecureStore's 2 KB limit. Tokens are not encrypted at rest — acceptable
    // pre-launch; harden later with a chunked SecureStore adapter if needed.
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // No URL-based session detection on native; only relevant for web OAuth redirects.
    detectSessionInUrl: Platform.OS === 'web',
  },
});

/** The current access token (JWT) to send as `Authorization: Bearer <token>` to
 *  our backend, or null when logged out. */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
