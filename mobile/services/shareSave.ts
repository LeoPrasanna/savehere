import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';
import { fetchClientMetadata } from './clientExtract';
import { refreshUsage } from './usageCache';

/**
 * Save a shared link WITHOUT the user having to look at SaveHere.
 *
 * ⚠️ THE POINT OF THIS FILE. A share is an interruption of something else —
 * you are mid-scroll in Instagram, you want the reel kept, you want to carry on
 * scrolling. Routing that to /save and making the user watch a progress screen
 * breaks exactly the flow the feature exists to protect. Nothing here needs a
 * decision from them: the URL is known, the save is unconditional, and the
 * summary was always asynchronous anyway.
 *
 * ⚠️ PHASE A. Android still LAUNCHES the app to deliver ACTION_SEND, so there
 * is a brief flash of SaveHere before it hands control back. Removing that
 * needs a translucent no-display Activity (a custom config plugin + Kotlin),
 * which is Phase B. iOS needs a Share Extension plus an App Group to share the
 * session — blocked on the Apple Developer account. This module is written so
 * both of those become "call `saveSharedLink` from somewhere else" rather than
 * a rewrite.
 */

/** Human name for the notification, from the URL alone — the server's platform
 *  field is not back yet when we post it, and waiting for it would defeat the
 *  purpose. */
export function platformLabel(url: string): string {
  const u = url.toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'YouTube';
  if (u.includes('instagram.com')) return 'Instagram';
  if (u.includes('facebook.com') || u.includes('fb.watch') || u.includes('fb.com')) return 'Facebook';
  if (u.includes('tiktok.com')) return 'TikTok';
  if (u.includes('linkedin.com')) return 'LinkedIn';
  return 'the web';
}

/**
 * Ask once, and never block the save on the answer.
 *
 * ⚠️ Android 13+ requires runtime POST_NOTIFICATIONS. A user who declines still
 * gets their save — the notification is how we REPORT the work, not the work
 * itself, so a refusal must never cost them the link.
 */
async function canNotify(): Promise<boolean> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'granted') return true;
    const asked = await Notifications.requestPermissionsAsync();
    return asked.status === 'granted';
  } catch {
    return false;
  }
}

async function notify(title: string, body: string) {
  if (!(await canNotify())) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: null,   // immediately
    });
  } catch {
    // A failed notification must never surface as a failed save.
  }
}

/**
 * Android needs a channel or notifications are silently dropped on 8.0+.
 * Idempotent, so calling it on every share is fine.
 */
export async function ensureNotificationChannel() {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('saves', {
      name: 'Saved links',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  } catch {}
}

/**
 * The whole background save. Resolves when the card exists server-side; the AI
 * summary continues on the backend after that, exactly as it does for a normal
 * save.
 *
 * Returns whether it worked, so the caller can decide whether to bounce the
 * user back out or leave the app open on an error they should see.
 */
export async function saveSharedLink(url: string): Promise<boolean> {
  const where = platformLabel(url);
  await ensureNotificationChannel();
  try {
    // Same two-step as app/save.tsx: kick the device-side metadata fetch off
    // alongside the save (never in front of it), then deliver it after. On
    // Instagram and Facebook this is the ONLY path that gets a caption, because
    // the server's datacenter IP is served a login wall.
    const metaPromise = fetchClientMetadata(url);
    const reel = await api.saveReel(url);
    metaPromise
      .then(meta => (meta ? api.sendClientMetadata(reel.id, meta) : null))
      .catch(() => {});

    // The AI budget just moved; keep the cache honest for the next screen.
    refreshUsage();

    await notify(
      `Saved from ${where}`,
      'Your summary is being written — it will be ready in your library.',
    );
    return true;
  } catch (e: any) {
    // Say what happened. A silent failure here is the worst outcome of all:
    // the user believes the link is kept, carries on scrolling, and finds
    // nothing later.
    await notify(
      `Couldn't save that ${where} link`,
      e?.message || 'Open SaveHere and paste it to try again.',
    );
    return false;
  }
}
