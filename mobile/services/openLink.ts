import { Alert, Linking, Platform } from 'react-native';

/**
 * Open a saved reel's source link, with an honest popup when it can't be opened
 * instead of failing silently. One place for the copy, used by the detail hero
 * thumbnail and the source-URL row.
 */

const FAIL_TITLE = "Couldn't open this link";
const FAIL_BODY =
  'A few things could be going on:\n\n' +
  '• The post may have been deleted or made private\n' +
  "• The platform's app isn't installed (it should fall back to the browser)\n" +
  "• You're offline or the connection dropped\n\n" +
  'Your save and its summary are still here either way.';

function notifyFailure() {
  if (Platform.OS === 'web') {
    // Alert.alert is a silent no-op on react-native-web.
    window.alert(`${FAIL_TITLE}\n\n${FAIL_BODY}`);
  } else {
    Alert.alert(FAIL_TITLE, FAIL_BODY);
  }
}

export async function openSourceLink(url?: string | null): Promise<boolean> {
  if (!url) {
    notifyFailure();
    return false;
  }

  if (Platform.OS === 'web') {
    // Do NOT gate on window.open()'s return value. react-native-web's Pressable
    // dispatches onPress ASYNCHRONOUSLY (through its responder system), so the
    // synchronous user-activation the popup blocker requires is already gone by
    // the time we run — window.open() then returns null even for a real click,
    // which made us false-alarm "couldn't open this link" on every working tap.
    // An anchor click is the reliable pattern: it opens the tab and hands us no
    // null to misread, and rel="noopener" covers the security concern via the
    // attribute (no fragile cross-origin `win.opener = null`, which throws in
    // some browsers). We can't detect a genuinely-blocked open here, but a false
    // failure popup on every successful click is the far worse bug — and real
    // failures on web (deleted/private post) open a tab that shows the
    // platform's own error, which we couldn't detect anyway.
    try {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      try { window.open(url, '_blank'); } catch {}
    }
    return true;
  }

  // Native: canOpenURL IS a real signal (nothing handles the scheme), so keep
  // the honest failure popup here.
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) throw new Error('no handler');
    await Linking.openURL(url);
    return true;
  } catch {
    notifyFailure();
    return false;
  }
}
