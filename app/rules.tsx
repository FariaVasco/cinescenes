import { useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import { C, FS, Fonts, SP } from '@/constants/theme';
import { BackButton } from '@/components/BackButton';
import { RulesCarousel } from '@/components/RulesCarousel';

export default function RulesScreen() {
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    }, [])
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <BackButton onPress={() => router.back()} style={styles.backBtn} />
        <Text style={styles.headerTitle}>How to Play</Text>
        <View style={styles.headerSpacer} />
      </View>

      <RulesCarousel onComplete={() => router.replace('/')} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SP.lg,
    paddingVertical: SP.sm + 2,
    borderBottomWidth: 2,
    borderBottomColor: C.inkFaint,
  },
  backBtn: { marginHorizontal: 0, marginTop: 0 },
  headerTitle: {
    fontFamily: Fonts.display,
    fontSize: FS.xl,
    color: C.ink,
    letterSpacing: 0.5,
  },
  headerSpacer: { width: 84 },
});
