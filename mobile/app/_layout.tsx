import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import { Fraunces_700Bold, Fraunces_900Black } from '@expo-google-fonts/fraunces';
import { HeaderHomeButton } from '../components/HomeButton';
import { LoginScreen } from '../components/LoginScreen';
import { Confetti } from '../components/Confetti';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { OnboardingModal } from '../components/OnboardingModal';
import { colors, font, typeface } from '../constants/theme';

function AppStack() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontFamily: typeface.display, fontWeight: '800', fontSize: font.lg },
        headerShadowVisible: false,
        headerRight: () => <HeaderHomeButton />,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="landing" options={{ headerShown: false }} />
      <Stack.Screen name="save" options={{ title: 'Save a Reel', presentation: 'modal' }} />
      <Stack.Screen name="ask" options={{ title: 'Ask your library' }} />
      <Stack.Screen name="rediscover" options={{ title: 'Rediscover' }} />
      <Stack.Screen name="help" options={{ title: 'What you can do' }} />
      <Stack.Screen name="profile" options={{ title: 'Edit profile' }} />
      <Stack.Screen name="reel/[id]" options={{ title: '' }} />
      <Stack.Screen name="workout/[reelId]" options={{ title: 'Workout Plan' }} />
      <Stack.Screen name="workout/session/[reelId]" options={{ title: 'Workout', headerShown: false }} />
    </Stack>
  );
}

// Gate the whole app on auth: spinner during the initial session check, the login
// screen when signed out, the app once a session exists. LoginScreen doesn't
// navigate — AuthProvider's listener flips this gate on sign-in/out.
function Gate() {
  const { session, loading, celebrate } = useAuth();
  // Display faces (Manrope for UI titles, Fraunces serif for brand moments);
  // body text stays on the system face. We don't block the gate on them — RN
  // falls back to system until they're ready.
  useFonts({ Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold, Fraunces_700Bold, Fraunces_900Black });
  return (
    <>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : session ? (
        <AppStack />
      ) : (
        <LoginScreen />
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
      <StatusBar style="light" />
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
});
