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
  try {
    if (Platform.OS === 'web') {
      // No feature string here: passing 'noopener' makes window.open return
      // null EVEN ON SUCCESS (per spec), which made this false-alarm on every
      // working click. Open plain (null only means genuinely blocked), then
      // sever the opener reference ourselves.
      const win = window.open(url, '_blank');
      if (!win) throw new Error('popup blocked');
      win.opener = null;
      return true;
    }
    // canOpenURL is false when nothing on the device handles the scheme.
    const supported = await Linking.canOpenURL(url);
    if (!supported) throw new Error('no handler');
    await Linking.openURL(url);
    return true;
  } catch {
    notifyFailure();
    return false;
  }
}
