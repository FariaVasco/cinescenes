import { useEffect } from 'react';
import { Platform } from 'react-native';
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
import { C } from '@/constants/theme';

SplashScreen.preventAutoHideAsync();

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

export default function RootLayout() {
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
}
