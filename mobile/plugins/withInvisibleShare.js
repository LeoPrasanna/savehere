const fs = require('fs');
const path = require('path');
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
} = require('@expo/config-plugins');

/**
 * ANDROID PHASE B — the invisible share, as a config plugin.
 *
 * Phase A (`expo-share-intent`) puts an ACTION_SEND filter on MainActivity, so
 * receiving a share launches the whole app: it works, and it flashes Findable
 * for 1–2 s in the middle of someone's Instagram scroll. This plugin moves the
 * filter to a translucent, content-less Activity that saves the link and
 * finishes, so the user never leaves Instagram.
 *
 * ⚠️ IT REMOVES THE FILTER FROM MainActivity, and that removal is not optional.
 * Two components advertising the same ACTION_SEND filter puts TWO Findable
 * entries in the Android share sheet — a visible bug, and the user has no way
 * to tell which one is the good one. `expo-share-intent` is therefore
 * configured with `disableAndroid: true` in app.json; this plugin also strips
 * the filter defensively, so re-enabling that option by accident cannot ship a
 * double entry.
 *
 * ⚠️ iOS IS UNTOUCHED. `expo-share-intent` keeps its iOS half, and Phase A's
 * JS handler stays mounted — it is still the path for iOS, for the fallback
 * below, and for anything that reaches MainActivity with a share. iOS's own
 * invisible share needs a Share Extension plus an App Group to carry the
 * session, both blocked on the Apple Developer account.
 *
 * ⚠️ THE BUILD RISK IS THE POINT OF KEEPING THIS SMALL. A config plugin that
 * throws fails the whole EAS build, and you find out 30–90 minutes later at the
 * end of a queue. Everything here is one manifest edit and one file copy; there
 * is no Gradle change, no dependency added, and no generated resource.
 * `npx expo prebuild --platform android` runs it locally in seconds — do that
 * before pushing.
 */

const PACKAGE_SUFFIX = 'share';
const SOURCE = path.join(__dirname, 'android', 'ShareSave.kt');

/** Drop the ACTION_SEND filter from MainActivity — ShareActivity owns it now. */
function stripMainActivitySendFilter(manifest) {
  const main = AndroidConfig.Manifest.getMainActivityOrThrow(manifest);
  const filters = main['intent-filter'];
  if (!Array.isArray(filters)) return;
  main['intent-filter'] = filters.filter(
    f =>
      !(f.action || []).some(a => {
        const name = a?.$?.['android:name'];
        return name === 'android.intent.action.SEND' ||
               name === 'android.intent.action.SEND_MULTIPLE';
      }),
  );
}

function addShareActivity(manifest, androidPackage) {
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  const name = `${androidPackage}.${PACKAGE_SUFFIX}.ShareActivity`;
  app.activity = (app.activity || []).filter(a => a?.$?.['android:name'] !== name);
  app.activity.push({
    $: {
      'android:name': name,
      'android:exported': 'true',
      // Translucent + no content = the user keeps looking at Instagram.
      'android:theme': '@android:style/Theme.Translucent.NoTitleBar',
      // Its own task, absent from Recents, and never resumed by Back: this
      // Activity is a doorway, and a doorway should not be somewhere you can
      // navigate back into.
      'android:taskAffinity': '',
      'android:excludeFromRecents': 'true',
      'android:noHistory': 'true',
    },
    'intent-filter': [
      {
        action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
        category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
        data: [{ $: { 'android:mimeType': 'text/*' } }],
      },
    ],
  });
}

function addShareService(manifest, androidPackage) {
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  const name = `${androidPackage}.${PACKAGE_SUFFIX}.ShareSaveService`;
  app.service = (app.service || []).filter(s => s?.$?.['android:name'] !== name);
  app.service.push({
    $: {
      'android:name': name,
      'android:exported': 'false',
      // Android 14+ requires the type on the manifest entry as well as the
      // startForeground call, or the promotion throws at runtime.
      'android:foregroundServiceType': 'dataSync',
    },
  });
}

function addPermissions(manifest) {
  // POST_NOTIFICATIONS is already added by expo-notifications; declaring it
  // twice is harmless and this must not depend on plugin ordering.
  AndroidConfig.Permissions.ensurePermissions(manifest, [
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
    'android.permission.POST_NOTIFICATIONS',
  ]);
}

const withManifest = config =>
  withAndroidManifest(config, cfg => {
    const androidPackage = AndroidConfig.Package.getPackage(cfg);
    if (!androidPackage) {
      throw new Error('[invisible-share] expo.android.package is not set in app.json');
    }
    stripMainActivitySendFilter(cfg.modResults);
    addShareActivity(cfg.modResults, androidPackage);
    addShareService(cfg.modResults, androidPackage);
    addPermissions(cfg.modResults);
    return cfg;
  });

/** Copy the Kotlin next to the app's own sources so it compiles with the app —
 *  no Gradle module, no dependency, nothing else to go wrong. */
const withKotlin = config =>
  withDangerousMod(config, [
    'android',
    cfg => {
      const androidPackage = AndroidConfig.Package.getPackage(cfg);
      if (!androidPackage) {
        throw new Error('[invisible-share] expo.android.package is not set in app.json');
      }
      const source = fs.readFileSync(SOURCE, 'utf8')
        // The file is written against the real package name; rewrite it if the
        // app is ever renamed, so a rename can't silently produce a class the
        // manifest points at and Gradle never compiles.
        .replace(/^package .+$/m, `package ${androidPackage}.${PACKAGE_SUFFIX}`);

      const dir = path.join(
        cfg.modRequest.platformProjectRoot,
        'app', 'src', 'main', 'java',
        ...androidPackage.split('.'),
        PACKAGE_SUFFIX,
      );
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'ShareSave.kt'), source);
      return cfg;
    },
  ]);

module.exports = config => withKotlin(withManifest(config));
