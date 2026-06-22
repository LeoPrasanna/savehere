import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { HeaderHomeButton } from '../components/HomeButton';
import { colors, font } from '../constants/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
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
        <Stack.Screen name="reel/[id]" options={{ title: '' }} />
        <Stack.Screen name="workout/[reelId]" options={{ title: 'Workout Plan' }} />
        <Stack.Screen name="workout/session/[reelId]" options={{ title: 'Workout', headerShown: false }} />
      </Stack>
    </SafeAreaProvider>
  );
}
