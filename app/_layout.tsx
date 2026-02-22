import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PaperProvider } from 'react-native-paper';
import { cinemaTheme } from '@/lib/theme';

export default function RootLayout() {
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
