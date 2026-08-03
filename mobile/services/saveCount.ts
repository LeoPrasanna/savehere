import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The user's last known save count, remembered across launches.
 *
 * ⚠️ THIS EXISTS TO STOP THE HOME SCREEN LYING WHILE IT LOADS.
 *
 * The home screen picks one of three stages from the count (see
 * components/Landing.tsx). Without a remembered value the count is `null` on
 * every launch, which fell through to the ZERO-SAVE stage — so a user with 63
 * saves was told "Save it. Then ask it." Measured against the staging backend
 * that was 21 seconds of the wrong screen, and a cold instance can be worse.
 *
 * One integer, so the trade is cheap: web reads it synchronously at module load
 * (first paint is already correct), native hydrates a beat later. A genuine
 * first launch has nothing stored and correctly shows the empty state.
 *
 * Cleared on account deletion — the next person to open the app on this device
 * must not inherit a stranger's number.
 */

const KEY = '@savehere:savecount:v1';

let cached: number | null = null;

if (Platform.OS === 'web') {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw !== null) {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 0) cached = n;
    }
  } catch {}
}

/** What we last knew, or null if we have never seen a count on this device. */
export const getSaveCount = (): number | null => cached;

/** Native boot: localStorage isn't readable at module init there. */
export async function hydrateSaveCount(): Promise<number | null> {
  if (Platform.OS === 'web') return cached;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw !== null) {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 0) cached = n;
    }
  } catch {}
  return cached;
}

export function rememberSaveCount(n: number) {
  if (!Number.isFinite(n) || n < 0 || n === cached) return;
  cached = n;
  if (Platform.OS === 'web') {
    try { window.localStorage.setItem(KEY, String(n)); } catch {}
  }
  AsyncStorage.setItem(KEY, String(n)).catch(() => {});
}

export function clearSaveCount() {
  cached = null;
  if (Platform.OS === 'web') {
    try { window.localStorage.removeItem(KEY); } catch {}
  }
  AsyncStorage.removeItem(KEY).catch(() => {});
}
