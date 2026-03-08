import React, { useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import { CinescenesLogo } from '@/components/CinescenesLogo';
import { CinemaButton } from '@/components/CinemaButton';
import { DecoFilmReel, DecoClapperboard, DecoStar } from '@/components/CinemaIcons';
import { C, T, SP } from '@/constants/theme';

type DecoEntry = {
  Component: React.ComponentType<{ size?: number; opacity?: number }>;
  size: number; top: string; rotate: string; opacity: number;
  left?: string; right?: string;
};

const DECOS: DecoEntry[] = [
  { Component: DecoClapperboard, size: 80,  top: '5%',  left: '5%',   rotate: '-15deg', opacity: 0.07 },
  { Component: DecoFilmReel,     size: 96,  top: '10%', right: '6%',  rotate: '10deg',  opacity: 0.08 },
  { Component: DecoStar,         size: 64,  top: '3%',  left: '48%',  rotate: '5deg',   opacity: 0.07 },
  { Component: DecoClapperboard, size: 72,  top: '70%', left: '3%',   rotate: '20deg',  opacity: 0.06 },
  { Component: DecoFilmReel,     size: 88,  top: '74%', right: '5%',  rotate: '-12deg', opacity: 0.07 },
  { Component: DecoStar,         size: 56,  top: '42%', left: '52%',  rotate: '15deg',  opacity: 0.06 },
  { Component: DecoClapperboard, size: 68,  top: '83%', left: '30%',  rotate: '-8deg',  opacity: 0.06 },
  { Component: DecoFilmReel,     size: 80,  top: '29%', left: '8%',   rotate: '22deg',  opacity: 0.07 },
  { Component: DecoStar,         size: 48,  top: '56%', right: '10%', rotate: '-5deg',  opacity: 0.06 },
  { Component: DecoStar,         size: 60,  top: '20%', left: '62%',  rotate: '30deg',  opacity: 0.05 },
];

export default function LandingScreen() {
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    }, [])
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* SVG decorative background */}
      {DECOS.map(({ Component, size, top, left, right, rotate, opacity }, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            top: top as any,
            left: left as any,
            right: right as any,
            transform: [{ rotate }],
          }}
          pointerEvents="none"
        >
          <Component size={size} opacity={opacity} />
        </View>
      ))}

      <View style={styles.hero}>
        <CinescenesLogo layout="vertical" iconSize={68} />
        <Text style={styles.tagline}>Build your timeline.</Text>
      </View>

      <View style={styles.actions}>
        <CinemaButton size="lg" onPress={() => router.push('/play')} style={styles.fullWidth}>
          LET'S PLAY
        </CinemaButton>

        <CinemaButton variant="ghost" size="md" onPress={() => router.push('/rules')} style={styles.fullWidth}>
          HOW TO PLAY
        </CinemaButton>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
    paddingHorizontal: SP.lg + 4,
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SP.md,
  },
  tagline: {
    ...T.overline,
    marginTop: SP.xs,
  },
  actions: {
    paddingBottom: SP.md,
    gap: SP.sm + 4,
  },
  fullWidth: {
    width: '100%',
  },
});
