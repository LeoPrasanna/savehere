import { useEffect, useState } from 'react';
import { Stack } from 'expo-router/stack';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet, Platform, BackHandler } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import { HeaderMenuButton } from '../components/HomeButton';
import { MascotLoader } from '../components/MascotLoader';
import { saveSharedLink } from '../services/shareSave';
import { LoginScreen } from '../components/LoginScreen';
import { Confetti } from '../components/Confetti';
import { TabBar } from '../components/TabBar';
import { ProfilePanel } from '../components/ProfilePanel';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { OnboardingModal } from '../components/OnboardingModal';
import { onUi } from '../services/uiBus';
import { consumeReopenPanel } from '../services/sessionFlags';
import {
  colors, font, typeface, themed, onSchemeChange, setScheme, isDark, SCHEME_STORAGE_KEY,
} from '../constants/theme';

/** Screen titles are tracked uppercase labels, not headline type — the nav is
 *  metadata, and metadata speaks in the small voice. */
const headerTitle = (t: string) => t.toUpperCase();

function AppStack() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.textPrimary,
        // No letterSpacing here — react-navigation's headerTitleStyle only
        // accepts fontFamily/fontSize/fontWeight/color. The tracking that the
        // rest of the system carries has to come from the title text itself,
        // which is why these are pre-uppercased instead.
        headerTitleStyle: {
          fontFamily: typeface.label,
          fontSize: font.xs,
          color: colors.textSecondary,
        },
        headerShadowVisible: false,
        // Hamburger on every stack route — the owner's requirement that it be
        // reachable everywhere. It was a Home button; Home is a tab now.
        headerRight: () => <HeaderMenuButton />,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      {/* The OAuth deep-link landing route. headerShown:false so the redirect
          through it never flashes a header + hamburger. See auth/callback.tsx
          for why the route has to exist at all. */}
      <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
      <Stack.Screen name="landing" options={{ headerShown: false }} />
      <Stack.Screen name="save" options={{ title: headerTitle('Save'), presentation: 'modal' }} />
      <Stack.Screen name="ask" options={{ title: headerTitle('Ask your library') }} />
      <Stack.Screen name="rediscover" options={{ title: headerTitle('Rediscover') }} />
      {/* Title stays blank — the screen's own hero is the title. */}
      <Stack.Screen name="todos" options={{ title: '' }} />
      <Stack.Screen name="help" options={{ title: headerTitle('What you can do') }} />
      <Stack.Screen name="profile" options={{ title: headerTitle('Profile') }} />
      {/* Appearance is not a route — it's three inline words in ProfilePanel.
          A whole screen for one three-way choice was never worth the tap. */}
      {/* The paywall owns its whole surface — no nav chrome competing with it. */}
      <Stack.Screen name="pro" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="reel/[id]" options={{ title: '' }} />
      <Stack.Screen name="workout/[reelId]" options={{ title: headerTitle('Workout') }} />
      <Stack.Screen name="workout/session/[reelId]" options={{ title: '', headerShown: false }} />
    </Stack>
  );
}

/**
 * The one profile panel, owned by the root.
 *
 * Opened from any screen's hamburger via the ui bus. `reels` is empty on purpose
 * — the panel prefers the server's own whole-library counts from `getUsage()`
 * and only falls back to a passed-in sample, which was always an undercount
 * anyway (it was whatever page happened to be loaded).
 */
function AppProfilePanel() {
  // Reopens itself after a scheme switch remounts the tree (one-shot flag).
  const [open, setOpen] = useState(consumeReopenPanel);
  useEffect(() => onUi('openProfile', () => setOpen(true)), []);
  return <ProfilePanel visible={open} onClose={() => setOpen(false)} reels={[]} />;
}

/**
 * SHARE-TO-SAVEHERE — the Android/iOS share sheet entry point.
 *
 * ⚠️ Why this needed a native module at all. Android delivers a share as an
 * `ACTION_SEND` Intent carrying `EXTRA_TEXT`; that is NOT a deep link, so
 * `Linking.getInitialURL()` and expo-router never see it. Declaring
 * `intentFilters` in app.json alone would have put SaveHere in the share sheet
 * and then opened it with nothing attached — visible, and broken. Reading the
 * extra requires native code, which is what `expo-share-intent` supplies.
 *
 * Mounted INSIDE the signed-in branch on purpose: a share that arrives while
 * signed out would otherwise navigate to /save behind the login gate and be
 * lost when the user finally signs in.
 *
 * ⚠️ This only works in a real build. Expo Go cannot load the native module,
 * and an OTA update cannot add one — the share sheet entry appears only after
 * the next EAS build is installed.
 */
function ShareIntentHandler() {
  const router = useRouter();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!hasShareIntent) return;
    // Instagram and YouTube share a bare URL; some apps share "Look at this
    // <url>" or append a title, so fall back to plucking the first URL out of
    // the text rather than refusing anything that isn't exactly a link.
    const raw = shareIntent?.webUrl || shareIntent?.text || '';
    const url = raw.match(/https?:\/\/\S+/)?.[0];
    // Reset FIRST. The native module holds the payload until it is cleared, so
    // an early return on a non-URL share (a photo, a plain note) must still
    // clear it — otherwise the same dead intent re-fires on every foreground.
    resetShareIntent();
    if (!url) return;

    /**
     * ⚠️ SAVES IN THE BACKGROUND — IT DOES NOT OPEN THE SAVE SCREEN.
     *
     * A share is an interruption of something else: you are mid-scroll in
     * Instagram, you want the reel kept, you want to carry on scrolling.
     * Routing to /save and making you watch a progress screen breaks exactly
     * the flow this feature exists to protect (owner, 2026-08-12). There is
     * nothing to decide — the URL is known, the save is unconditional, and the
     * summary was always asynchronous.
     *
     * On success we hand control straight back to the app you came from.
     * `exitApp` finishes OUR activity, which returns you to Instagram; it is
     * only ever reached on a share, never on a normal launch.
     *
     * On FAILURE we deliberately stay open. A notification already said what
     * went wrong, but bouncing someone out of a failed save is how a link gets
     * quietly lost.
     */
    setSaving(true);
    saveSharedLink(url).then(ok => {
      setSaving(false);
      if (ok && Platform.OS === 'android') BackHandler.exitApp();
      else if (!ok) router.push({ pathname: '/save', params: { url } });
    });
  }, [hasShareIntent, shareIntent, router, resetShareIntent]);

  // Android still LAUNCHES the app to deliver ACTION_SEND (Phase B removes
  // that with a translucent activity), so there is a brief flash either way.
  // Better it says what is happening than shows a blank canvas.
  if (!saving) return null;
  return (
    <View style={styles.shareOverlay}>
      <MascotLoader label="Saving to your library" />
    </View>
  );
}

// Gate the whole app on auth: spinner during the initial session check, the login
// screen when signed out, the app once a session exists. LoginScreen doesn't
// navigate — AuthProvider's listener flips this gate on sign-in/out.
function Gate() {
  const { session, loading, celebrate } = useAuth();
  // One family, three weights — Inter carries the wordmark, headings, body and
  // labels alike (see constants/theme.ts). We don't block the gate on them; RN
  // falls back to the system face, which is metrically close enough that there
  // is no layout jump when they land.
  useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold });

  // Scheme switching: bumping the epoch remounts the navigator so every screen
  // re-renders against the freshly regenerated themed() sheets — instant, no
  // page reload. On web the current route survives (it's URL-driven).
  const [schemeEpoch, setSchemeEpoch] = useState(0);
  useEffect(() => onSchemeChange(() => setSchemeEpoch(e => e + 1)), []);

  // Native boot: localStorage isn't readable at module init there, so apply the
  // stored preference right after mount (one default-scheme first frame).
  useEffect(() => {
    if (Platform.OS === 'web') return;
    AsyncStorage.getItem(SCHEME_STORAGE_KEY)
      .then(k => { if (k === 'light' || k === 'dark' || k === 'system') setScheme(k, { persist: false }); })
      .catch(() => {});
  }, []);

  return (
    <>
      {/* Keyed on the scheme epoch too: the bar's own colour has to flip with
          the canvas, and `style` is read at mount.
          ⚠️ The key is PREFIXED. Sibling keys share one namespace, so a bare
          `key={schemeEpoch}` here collided with the gate's below — both were
          "0" and React warned about duplicate children on every render. */}
      <StatusBar key={`bar-${schemeEpoch}`} style={isDark() ? 'light' : 'dark'} />
      {loading ? (
        // MascotLoader holds off for 350ms before drawing anything, so a warm
        // start shows no loader at all rather than a flash of one — which is
        // also the cheapest "make it faster" there is.
        <View style={styles.center}><MascotLoader /></View>
      ) : session ? (
        <>
          <AppStack key={`app-${schemeEpoch}`} />
          {/* The app chrome lives ABOVE the router so it is identical on every
              route and cannot drift between them: the floating tab bar, and the
              single profile panel that every screen's hamburger opens through
              the ui bus. Previously each screen rendered its own panel. */}
          <TabBar key={`tabs-${schemeEpoch}`} />
          <AppProfilePanel key={`panel-${schemeEpoch}`} />
          {/* Renders nothing — it just routes an incoming share into /save. */}
          <ShareIntentHandler />
        </>
      ) : (
        <LoginScreen key={`login-${schemeEpoch}`} />
      )}
      {/* Welcome confetti — overlaid above the gate so it keeps playing as the app
          mounts after sign-in. */}
      {celebrate && <Confetti />}
      <OnboardingModal />
    </>
  );
}

export default function RootLayout() {
  return (
    // ShareIntentProvider must sit ABOVE the router — expo-share-intent reads
    // the launch intent as the app starts, before any route mounts.
    <ShareIntentProvider>
      <SafeAreaProvider>
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </SafeAreaProvider>
    </ShareIntentProvider>
  );
}

// themed(): this sheet bakes in the canvas colour, and the canvas inverts
// between schemes. A plain StyleSheet.create here paints white-on-white.
const styles = themed(() => StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  // Covers whatever the app happened to be showing when the share arrived —
  // the user came from Instagram and should see one thing, not a half-loaded
  // library behind a spinner.
  shareOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.background,
  },
}));
