import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * A handful of the user's most recent thumbnail URLs, kept so the signed-out
 * welcome screen can show a real collage instead of empty frames.
 *
 * ── Why the app's own thumbnails, and not stock photography ──────────────────
 * The reference welcome screen is image-led: a darkened collage of real content.
 * Three ways to get images onto a signed-out screen, and only one is honest:
 *
 *   1. Bundle stock photos — someone else's work, a licence to track, and dead
 *      weight in every build.
 *   2. Hotlink images from the web at runtime — other people's bandwidth and
 *      other people's copyright.
 *   3. Show the user their OWN saves. Costs nothing, needs no licence, and is
 *      strictly better product: the reference app shows you strangers' content,
 *      this shows you what you came back for.
 *
 * First-ever launch has nothing to show, which is correct — that user gets the
 * numbered empty contact sheet, and it fills in from their second launch on.
 *
 * ⚠️ These are thumbnail URLs, not content. They survive sign-out on purpose
 * (that is the entire point), so `clear()` is called on ACCOUNT DELETION and
 * from the sign-out path if a shared device is ever a concern. They are already
 * public CDN URLs — nothing private is stored — but a stranger picking up the
 * phone should not see a mosaic of the last person's saves.
 */

const KEY = '@savehere:thumbs:v1';
const MAX = 12;

/** Synchronously-known value, so the first paint on web is already correct. */
let cached: string[] = [];

if (Platform.OS === 'web') {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) cached = JSON.parse(raw);
  } catch {}
}

/** What we have right now. Never throws; empty until something is remembered. */
export function getThumbs(): string[] {
  return cached;
}

/** Native boot: localStorage isn't readable at module init, so hydrate on mount. */
export async function hydrateThumbs(): Promise<string[]> {
  if (Platform.OS === 'web') return cached;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) cached = JSON.parse(raw);
  } catch {}
  return cached;
}

/**
 * Remember the newest thumbnails. Called wherever a list of reels lands.
 * Fail-open and cheap: bails out when nothing changed, so the common case
 * (re-focusing a screen) writes nothing.
 */
export function rememberThumbs(urls: (string | null | undefined)[]) {
  const next = urls.filter((u): u is string => !!u).slice(0, MAX);
  if (next.length === 0) return;
  if (next.length === cached.length && next.every((u, i) => u === cached[i])) return;
  cached = next;
  const raw = JSON.stringify(next);
  if (Platform.OS === 'web') {
    try { window.localStorage.setItem(KEY, raw); } catch {}
  }
  AsyncStorage.setItem(KEY, raw).catch(() => {});
}

/** Forget everything. Call on account deletion. */
export function clearThumbs() {
  cached = [];
  if (Platform.OS === 'web') {
    try { window.localStorage.removeItem(KEY); } catch {}
  }
  AsyncStorage.removeItem(KEY).catch(() => {});
}
