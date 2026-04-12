import { useCallback, useEffect } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import { C, R, Fonts, FS, SP } from '@/constants/theme';
import { useAppStore } from '@/store/useAppStore';
import { supabase } from '@/lib/supabase';

const lcClapperboard  = require('@/assets/lc-clapperboard.png');
const lcFilmReel      = require('@/assets/lc-film-reel.png');
const lcSpinningWheel = require('@/assets/lc-spinning-wheel.png');
const lcCoin          = require('@/assets/lc-coin.png');
const lcFilmStrip     = require('@/assets/lc-film-strip.png');
const lcCard          = require('@/assets/lc-card.png');

export default function LandingScreen() {
  const router = useRouter();
  const { setActiveMovies } = useAppStore();

  useFocusEffect(
    useCallback(() => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    }, [])
  );

  useEffect(() => {
    fetchActiveMovies();
  }, []);

  async function fetchActiveMovies() {
    const { data, error } = await supabase
      .from('movies')
      .select('*')
      .eq('scan_status', 'validated');
    if (data && !error) setActiveMovies(data);
  }

  return (
    <SafeAreaView style={styles.container}>

      {/* Geometric background accents */}
      <View style={styles.accentTopRight}  pointerEvents="none" />
      <View style={styles.accentBottomLeft} pointerEvents="none" />

      {/* Background icons — low opacity */}
      <Image source={lcFilmReel}      style={styles.bgFilmReel}      pointerEvents="none" />
      <Image source={lcSpinningWheel} style={styles.bgSpinningWheel} pointerEvents="none" />
      <Image source={lcCoin}          style={styles.bgCoin}          pointerEvents="none" />

      {/* Top bar — ? only */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.helpBtn} onPress={() => router.push('/rules')} activeOpacity={0.7}>
          <Text style={styles.helpBtnText}>?</Text>
        </TouchableOpacity>
      </View>

      {/* Hero — centered */}
      <View style={styles.hero}>
        <Image source={lcClapperboard} style={styles.logoIcon} />
        <Text style={styles.wordmark}>CINESCENES</Text>
        <Text style={styles.tagline}>A love letter to cinema</Text>
        <View style={styles.divider} />
      </View>

      {/* Mode cards */}
      <View style={styles.cardArea}>

        {/* Go Digital */}
        <TouchableOpacity
          style={[styles.card, styles.cardPrimary]}
          onPress={() => router.push('/local-lobby')}
          activeOpacity={0.85}
        >
          <Image source={lcFilmStrip} style={styles.cardIcon} />
          <Text style={[styles.cardTitle, styles.cardTitlePrimary]}>Go Digital</Text>
          <Text style={[styles.cardSub, styles.cardSubPrimary]}>
            Up to 10 players · no physical cards needed
          </Text>
        </TouchableOpacity>

        {/* Use Your Deck */}
        <TouchableOpacity
          style={[styles.card, styles.cardSecondary]}
          onPress={() => router.push('/scanner')}
          activeOpacity={0.85}
        >
          <Image source={lcCard} style={styles.cardIcon} />
          <Text style={[styles.cardTitle, styles.cardTitleSecondary]}>Use Your Deck</Text>
          <Text style={styles.cardSub}>
            Scan the QR code on your physical cards
          </Text>
        </TouchableOpacity>

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
    top: '30%',
    width: 110,
    height: 110,
    opacity: 0.12,
  },
  bgSpinningWheel: {
    position: 'absolute',
    right: -16,
    top: '42%',
    width: 100,
    height: 100,
    opacity: 0.10,
  },
  bgCoin: {
    position: 'absolute',
    right: 24,
    bottom: '14%',
    width: 64,
    height: 64,
    opacity: 0.10,
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingTop: SP.sm,
    paddingBottom: SP.xs,
  },
  helpBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: C.inkFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpBtnText: {
    fontFamily: Fonts.display,
    fontSize: FS.base,
    color: C.textMuted,
    lineHeight: 18,
  },

  // Hero
  hero: {
    alignItems: 'center',
    paddingTop: SP.lg,
    paddingBottom: SP.xl,
    gap: SP.sm,
  },
  logoIcon: {
    width: 72,
    height: 72,
    resizeMode: 'contain',
    marginBottom: SP.xs,
  },
  wordmark: {
    fontFamily: Fonts.display,
    fontSize: 48,
    letterSpacing: 6,
    color: C.cerulean,
    textAlign: 'center',
  },
  tagline: {
    fontFamily: Fonts.label,
    fontSize: FS.xs,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    color: C.textMuted,
  },
  divider: {
    width: 40,
    height: 2,
    backgroundColor: C.ochre,
    marginTop: SP.xs,
  },

  // Cards
  cardArea: {
    flex: 1,
    justifyContent: 'flex-start',
    gap: SP.md,
    paddingBottom: SP.lg,
  },
  card: {
    borderRadius: R.card,
    borderWidth: 2,
    borderColor: C.ink,
    padding: 28,
    alignItems: 'center',
    gap: 8,
  },
  cardPrimary: {
    backgroundColor: C.ochre,
  },
  cardSecondary: {
    backgroundColor: C.surface,
  },
  cardIcon: {
    width: 56,
    height: 56,
    resizeMode: 'contain',
    marginBottom: 4,
  },
  cardTitle: {
    fontFamily: Fonts.display,
    fontSize: FS.xl + 2,
    letterSpacing: 0.5,
    color: C.ink,
  },
  cardTitlePrimary: {},
  cardTitleSecondary: {},
  cardSub: {
    fontFamily: Fonts.label,
    fontSize: FS.sm,
    color: C.textSub,
    textAlign: 'center',
    lineHeight: 18,
  },
  cardSubPrimary: {
    color: 'rgba(26,26,26,0.6)',
  },
});
