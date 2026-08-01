import { useEffect, useState } from 'react';
import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import { HeaderHomeButton } from '../components/HomeButton';
import { LoginScreen } from '../components/LoginScreen';
import { Confetti } from '../components/Confetti';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { OnboardingModal } from '../components/OnboardingModal';
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
        headerRight: () => <HeaderHomeButton />,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
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
        <View style={styles.center}>
          <ActivityIndicator color={colors.textPrimary} size="large" />
        </View>
      ) : session ? (
        <AppStack key={`app-${schemeEpoch}`} />
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
    <SafeAreaProvider>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

// themed(): this sheet bakes in the canvas colour, and the canvas inverts
// between schemes. A plain StyleSheet.create here paints white-on-white.
const styles = themed(() => StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
}));
