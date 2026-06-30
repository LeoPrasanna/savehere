import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { HeaderHomeButton } from '../components/HomeButton';
import { LoginScreen } from '../components/LoginScreen';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { colors, font } from '../constants/theme';

function AppStack() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontWeight: '800', fontSize: font.lg },
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
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }
  return session ? <AppStack /> : <LoginScreen />;
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
