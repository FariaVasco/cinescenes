import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { C, T, SP } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { CinescenesLogo } from '@/components/CinescenesLogo';
import { CinemaButton } from '@/components/CinemaButton';
import { BackButton } from '@/components/BackButton';

const lcCoin        = require('@/assets/lc-coin.png');
const lcStarburst   = require('@/assets/lc-starburst.png');
const lcLightning   = require('@/assets/lc-lightning.png');
const lcHourglass   = require('@/assets/lc-hourglass.png');
const lcMysteryCard = require('@/assets/lc-mystery-card.png');
const lcTrophy      = require('@/assets/lc-trophy.png');

const DECOS = [
  { src: lcCoin,        size: 88, top: '4%',  right: '4%',  rotate: '10deg'  },
  { src: lcStarburst,   size: 60, top: '8%',  left: '5%',   rotate: '-15deg' },
  { src: lcLightning,   size: 56, top: '42%', left: '3%',   rotate: '-8deg'  },
  { src: lcHourglass,   size: 64, top: '70%', right: '5%',  rotate: '12deg'  },
  { src: lcMysteryCard, size: 72, top: '78%', left: '8%',   rotate: '-6deg'  },
  { src: lcTrophy,      size: 52, top: '30%', right: '6%',  rotate: '18deg'  },
];

export default function SignInScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo: string }>();
  const { signInWithApple, signInWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);

  async function handleApple() {
    setLoading(true);
    try {
      await signInWithApple();
      router.replace((returnTo as any) ?? '/');
    } catch (e: any) {
      if (e?.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Sign in failed', e?.message ?? 'Could not sign in with Apple');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    try {
      await signInWithGoogle();
      router.replace((returnTo as any) ?? '/');
    } catch (e: any) {
      Alert.alert('Sign in failed', e?.message ?? 'Could not sign in with Google');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Decorative background */}
      {DECOS.map(({ src, size, top, left, right, rotate }, i) => (
        <View
          key={i}
          style={{ position: 'absolute', top: top as any, left: left as any, right: right as any, transform: [{ rotate }] }}
          pointerEvents="none"
        >
          <Image source={src} style={{ width: size, height: size, resizeMode: 'contain', opacity: 0.1 }} />
        </View>
      ))}

      <BackButton onPress={() => router.back()} />

      <View style={styles.content}>
        <CinescenesLogo layout="vertical" iconSize={56} />

        <View style={styles.textGroup}>
          <Text style={styles.overline}>SIGN IN TO CONTINUE</Text>
          <Text style={styles.title}>Unlock Premium</Text>
          <Text style={styles.body}>
            Host themed movie collections{'\n'}and future game modes
          </Text>
        </View>

        <CinemaButton
          size="lg"
          onPress={Platform.OS === 'ios' ? handleApple : handleGoogle}
          disabled={loading}
          style={styles.fullWidth}
        >
          {loading
            ? '…'
            : Platform.OS === 'ios'
            ? 'CONTINUE WITH APPLE'
            : 'CONTINUE WITH GOOGLE'}
        </CinemaButton>

        <Text style={styles.hint}>Only needed to host premium games</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.surfaceHigh,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SP.xl + 8,
    gap: SP.xl,
  },
  textGroup: {
    alignItems: 'center',
    gap: SP.sm,
  },
  overline: {
    ...T.overline,
  },
  title: {
    ...T.display,
    color: C.textPrimary,
    textAlign: 'center',
  },
  body: {
    ...T.body,
    textAlign: 'center',
  },
  fullWidth: {
    width: '100%',
  },
  hint: {
    ...T.caption,
    textAlign: 'center',
  },
});
