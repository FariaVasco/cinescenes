import { useEffect } from 'react';
import { Platform, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { ErrorBoundaryProps } from 'expo-router';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PaperProvider } from 'react-native-paper';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { Bangers_400Regular } from '@expo-google-fonts/bangers';
import { ComicNeue_400Regular, ComicNeue_700Bold } from '@expo-google-fonts/comic-neue';
import { PatrickHand_400Regular } from '@expo-google-fonts/patrick-hand';
import { cinemaTheme } from '@/lib/theme';
import { initRevenueCat } from '@/lib/revenuecat';
import { useAuth } from '@/hooks/useAuth';
import { useAppStore } from '@/store/useAppStore';
import { C } from '@/constants/theme';
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://2575688a7bbb73d56fe13de7a78445b2@o4511372477726720.ingest.de.sentry.io/4511372480544848',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

SplashScreen.preventAutoHideAsync();

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={eb.container}>
      <Text style={eb.title}>Something went wrong</Text>
      <Text style={eb.message}>{error.message}</Text>
      <TouchableOpacity style={eb.button} onPress={retry}>
        <Text style={eb.buttonText}>TRY AGAIN</Text>
      </TouchableOpacity>
    </View>
  );
}

const eb = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a2e', alignItems: 'center', justifyContent: 'center', padding: 32 },
  title:     { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 12 },
  message:   { color: '#aaa', fontSize: 13, textAlign: 'center', marginBottom: 32 },
  button:    { backgroundColor: '#f5c518', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 8 },
  buttonText:{ color: '#1a1a2e', fontWeight: 'bold', fontSize: 14 },
});

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

export default Sentry.wrap(function RootLayout() {
  const { restoreSession } = useAuth();

  const [fontsLoaded] = useFonts({
    Bangers_400Regular,
    ComicNeue_400Regular,
    ComicNeue_700Bold,
    PatrickHand_400Regular,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  useEffect(() => {
    if (Platform.OS === 'android') {
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
    }
    initRevenueCat();
    restoreSession();
    useAppStore.getState().hydrateSettings();
  }, []);


  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <PaperProvider theme={cinemaTheme}>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: C.bg },
            animation: 'fade',
          }}
        />
      </PaperProvider>
    </SafeAreaProvider>
  );
});
