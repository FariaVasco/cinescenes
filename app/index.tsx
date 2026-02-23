import { useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import { CinescenesLogo } from '@/components/CinescenesLogo';

const DECORATIONS = [
  { emoji: '🎬', top: '5%',  left: '5%',   rotate: '-15deg', opacity: 0.09 },
  { emoji: '🍿', top: '10%', right: '6%',  rotate: '10deg',  opacity: 0.08 },
  { emoji: '⭐', top: '3%',  left: '48%',  rotate: '5deg',   opacity: 0.07 },
  { emoji: '🎭', top: '70%', left: '3%',   rotate: '20deg',  opacity: 0.09 },
  { emoji: '🎥', top: '74%', right: '5%',  rotate: '-12deg', opacity: 0.1  },
  { emoji: '🌟', top: '42%', left: '52%',  rotate: '15deg',  opacity: 0.06 },
  { emoji: '🎬', top: '83%', left: '30%',  rotate: '-8deg',  opacity: 0.07 },
  { emoji: '🍿', top: '29%', left: '8%',   rotate: '22deg',  opacity: 0.07 },
  { emoji: '⭐', top: '56%', right: '10%', rotate: '-5deg',  opacity: 0.07 },
  { emoji: '🎭', top: '20%', left: '62%',  rotate: '30deg',  opacity: 0.06 },
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
      {DECORATIONS.map((d, i) => (
        <Text
          key={i}
          style={{
            position: 'absolute',
            fontSize: 36,
            opacity: d.opacity,
            top: d.top as any,
            left: d.left as any,
            right: d.right as any,
            transform: [{ rotate: d.rotate }],
          }}
          pointerEvents="none"
        >
          {d.emoji}
        </Text>
      ))}

      <View style={styles.hero}>
        <CinescenesLogo layout="vertical" iconSize={68} />
        <Text style={styles.tagline}>Build your timeline.</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.playButton}
          onPress={() => router.push('/play')}
          activeOpacity={0.85}
        >
          <Text style={styles.playButtonText}>Let's Play  →</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.rulesButton}
          onPress={() => router.push('/rules')}
          activeOpacity={0.8}
        >
          <Text style={styles.rulesButtonText}>Rules</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#100a20',
    paddingHorizontal: 28,
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  tagline: {
    fontSize: 14,
    color: '#9a9aaa',
    letterSpacing: 2.5,
    textAlign: 'center',
    textTransform: 'uppercase',
    fontWeight: '500',
    marginTop: 4,
  },
  actions: {
    paddingBottom: 16,
    gap: 12,
  },
  playButton: {
    backgroundColor: '#f5c518',
    borderRadius: 22,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: '#f5c518',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  playButtonText: {
    fontSize: 19,
    fontWeight: '900',
    color: '#0a0a0a',
    letterSpacing: 0.5,
  },
  rulesButton: {
    borderRadius: 22,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  rulesButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 0.5,
  },
});
