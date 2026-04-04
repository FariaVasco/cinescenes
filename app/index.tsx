import { useCallback } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import { CinemaButton } from '@/components/CinemaButton';
import { C, Fonts, FS, SP } from '@/constants/theme';

const lcClapperboard  = require('@/assets/lc-clapperboard.png');
const lcFilmReel      = require('@/assets/lc-film-reel.png');
const lcSpinningWheel = require('@/assets/lc-spinning-wheel.png');
const lcCoin          = require('@/assets/lc-coin.png');

export default function LandingScreen() {
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    }, [])
  );

  return (
    <SafeAreaView style={styles.container}>

      {/* Geometric background accents */}
      <View style={styles.accentTopRight}  pointerEvents="none" />
      <View style={styles.accentBottomLeft} pointerEvents="none" />

      {/* Background icons — low opacity */}
      <Image source={lcFilmReel}      style={styles.bgFilmReel}      pointerEvents="none" />
      <Image source={lcSpinningWheel} style={styles.bgSpinningWheel} pointerEvents="none" />
      <Image source={lcCoin}          style={styles.bgCoin}          pointerEvents="none" />

      {/* Hero */}
      <View style={styles.hero}>

        {/* Light halo behind main icon to lift it from background icons */}
        <View style={styles.iconHalo}>
          <Image source={lcClapperboard} style={styles.mainIcon} />
        </View>

        <Text style={styles.wordmark}>CINESCENES</Text>
        <Text style={styles.tagline}>A love letter to cinema</Text>
        <View style={styles.divider} />
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <CinemaButton size="lg" onPress={() => router.push('/play')} style={styles.fullWidth}>
          Let's Play
        </CinemaButton>
        <CinemaButton
          variant="ghost"
          size="md"
          onPress={() => router.push('/rules')}
          style={styles.fullWidth}
        >
          How to Play
        </CinemaButton>
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
    paddingHorizontal: SP.lg,
  },

  // Geometric accents
  accentTopRight: {
    position: 'absolute',
    top: -80,
    right: -80,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(232,55,42,0.07)',
  },
  accentBottomLeft: {
    position: 'absolute',
    bottom: -60,
    left: -60,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(74,158,196,0.07)',
  },

  // Background icons
  bgFilmReel: {
    position: 'absolute',
    left: -20,
    top: '22%',
    width: 130,
    height: 130,
    opacity: 0.18,
  },
  bgSpinningWheel: {
    position: 'absolute',
    right: -16,
    top: '30%',
    width: 110,
    height: 110,
    opacity: 0.15,
  },
  bgCoin: {
    position: 'absolute',
    right: 24,
    bottom: '18%',
    width: 72,
    height: 72,
    opacity: 0.14,
  },

  // Hero
  hero: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SP.sm,
  },
  iconHalo: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: C.bg,
    shadowColor: C.bg,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 28,
    elevation: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainIcon: {
    width: 140,
    height: 140,
    resizeMode: 'contain',
  },
  wordmark: {
    fontFamily: Fonts.display,
    fontSize: 52,
    letterSpacing: 8,
    color: C.cerulean,
    marginTop: SP.sm,
    textAlign: 'center',
  },
  tagline: {
    fontFamily: Fonts.label,
    fontSize: FS.xs,
    letterSpacing: 3.5,
    textTransform: 'uppercase',
    color: C.textMuted,
    marginTop: SP.xs,
  },
  divider: {
    width: 64,
    height: 2,
    backgroundColor: C.ink,
    marginTop: SP.md,
  },

  // Buttons
  actions: {
    paddingBottom: SP.lg,
    gap: SP.sm,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
});
