// Thin web-safe wrapper around expo-haptics. Haptics are a native-only API; on web
// the calls are no-ops (and can reject), so every call is guarded by Platform and
// swallowed — a missing buzz must never surface an error to the user.
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

const enabled = Platform.OS === 'ios' || Platform.OS === 'android';

/** Save succeeded, summary finished — a positive confirmation. */
export function success() {
  if (!enabled) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/** A destructive prompt is about to appear (e.g. delete confirm). */
export function warning() {
  if (!enabled) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}

/** Something went wrong — save/extraction failed. */
export function error() {
  if (!enabled) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
}

/** A light tap for routine actions (card delete, toggles). */
export function tap() {
  if (!enabled) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}
