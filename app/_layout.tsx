import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PaperProvider } from 'react-native-paper';
import { cinemaTheme } from '@/lib/theme';
import { initRevenueCat } from '@/lib/revenuecat';
import { useAuth } from '@/hooks/useAuth';

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

export default function RootLayout() {
  const { restoreSession } = useAuth();

  useEffect(() => {
    if (Platform.OS === 'android') {
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
    }
    initRevenueCat();
    restoreSession();
  }, []);

  return (
    <SafeAreaProvider>
      <PaperProvider theme={cinemaTheme}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#100a20' },
            animation: 'fade',
          }}
        />
      </PaperProvider>
    </SafeAreaProvider>
  );
}
